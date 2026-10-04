import { nsecEncode } from "nostr-tools/nip19";
import { getPublicKey } from "nostr-tools/pure";
import { create } from "zustand";
import { requestPersistentStorage } from "../db";
import { t } from "../i18n";
import { createNip07Signer, type Signer } from "../nostr/signer";
import { showToast } from "../ui/toast";
import { createLocalSigner } from "./localSigner";
import { waitForNostr } from "./nip07";
import {
  connectBunker,
  disconnectNip46,
  Nip46Error,
  nip46Signer,
  restoreNip46,
  startNostrConnect,
} from "./nip46";
import { parseNsec } from "./nsec";
import { getNwcStore } from "./nwcStore";
import { getPasskeyVault } from "./passkeyVault";
import { getKeyVault } from "./webKeyVault";

/** 保存するセッション（{"method":"nip07" | "local" | "nip46","pubkey":"<hex>"}）。秘密鍵は入れない */
export const SESSION_KEY = "nostrism.session";
/** LP がログイン済みかだけを判定するためのマーカー（値は "1"） */
export const SESSION_FLAG_KEY = "nostrism.session.flag";

export type SessionStatus = "loading" | "out" | "in";
/** nip07 = 拡張機能、local = このブラウザに保管した秘密鍵（nsec）、nip46 = リモート署名（署名アプリ） */
export type SessionMethod = "nip07" | "local" | "nip46";

type SavedSession = { method: SessionMethod; pubkey: string };

/**
 * ログイン失敗の理由。missing = 拡張が見つからない（待ち時間切れ）、rejected = 拒否・失敗、
 * invalid-format = nsec1 で始まらない、invalid-key = 秘密鍵として読めない、unavailable = 秘密鍵・接続情報を保管できない、
 * invalid-uri = bunker:// として読めない、timeout = 署名アプリが応答しない、cancelled = 利用者が止めた
 */
export type LoginFailure =
  | "missing"
  | "rejected"
  | "invalid-format"
  | "invalid-key"
  | "unavailable"
  | "invalid-uri"
  | "timeout"
  | "cancelled";

// 入力の中身は入れない
const LOGIN_ERROR_MESSAGES: Record<LoginFailure, string> = {
  missing: "NIP-07 extension not found",
  rejected: "NIP-07 login failed",
  "invalid-format": "input is not an nsec",
  "invalid-key": "nsec is not a valid secret key",
  unavailable: "secret key storage is unavailable",
  "invalid-uri": "input is not a bunker URI",
  timeout: "remote signer did not respond",
  cancelled: "cancelled",
};

export class LoginError extends Error {
  readonly reason: LoginFailure;

  constructor(reason: LoginFailure, options?: ErrorOptions) {
    super(LOGIN_ERROR_MESSAGES[reason], options);
    this.name = "LoginError";
    this.reason = reason;
  }
}

/** 新規生成した鍵（控えの表示用）。ログインは控えを確認した後に loginWithNewKey で確定する */
export type NewKey = { pubkey: string; nsec: string };

/**
 * nostrconnect:// での接続待ち。uri は QR・リンクに出す（secret を含む）。done はログインの確定で終わり、
 * 失敗時は LoginError。cancel で待ちをやめる（done は LoginError("cancelled")）
 */
export type NostrConnectLogin = { uri: string; done: Promise<void>; cancel(): void };

type SessionState = {
  status: SessionStatus;
  method: SessionMethod | null;
  pubkey: string | null;
  /** 拡張機能（NIP-07）でログインする。失敗時は LoginError を投げる */
  login(): Promise<void>;
  /** 秘密鍵（nsec）を取り込んでログインする。失敗時は LoginError を投げる */
  loginWithNsec(input: string): Promise<void>;
  /** 新しい鍵を作って保管し、控えの表示用に返す（まだログインしない）。失敗時は LoginError("unavailable") */
  generateNewKey(): Promise<NewKey>;
  /** 控えを確認した後に、generateNewKey で保管した鍵でログインする。保管した鍵が違えば LoginError("unavailable") */
  loginWithNewKey(pubkey: string): Promise<void>;
  /** bunker:// で署名アプリ（NIP-46）と接続してログインする。失敗時は LoginError を投げる */
  loginWithBunker(input: string, signal?: AbortSignal): Promise<void>;
  /** nostrconnect:// で署名アプリ（NIP-46）からの接続を待ってログインする */
  startNostrConnectLogin(): NostrConnectLogin;
  /**
   * ログアウトする。保管した秘密鍵・リモート署名の接続情報も消す（方式に関係なく）。
   * [#537] ウォレット接続（NWC）も消す（共用 PC のブラウザを想定。ネイティブは「接続を解除」でだけ消す）
   */
  logout(): void;
  /** 起動時に保存済みセッションを復元する。拡張・保管庫の公開鍵と一致しなければ未ログインへ戻す */
  restore(): Promise<void>;
};

const signedOut = { status: "out", method: null, pubkey: null } as const;

/**
 * ログイン状態（ネイティブの SignerProvider に対応）。鍵を勝手に作らず、未ログインならゲートを出す。
 */
export const useSession = create<SessionState>()((set) => ({
  status: "loading",
  method: null,
  pubkey: null,

  async login() {
    const nostr = await waitForNostr();
    if (!nostr) throw new LoginError("missing");
    let pubkey: string;
    try {
      pubkey = await createNip07Signer().publicKey();
    } catch (e) {
      throw new LoginError("rejected", { cause: e });
    }
    writeSaved({ method: "nip07", pubkey });
    set({ status: "in", method: "nip07", pubkey });
    // 前のローカル鍵・パスキー保護・リモート署名の接続の消し残しを掃除する
    void getKeyVault().clear();
    void getPasskeyVault().clear();
    void disconnectNip46();
  },

  async loginWithNsec(input) {
    const parsed = parseNsec(input);
    if (!parsed.ok) throw new LoginError(parsed.reason === "format" ? "invalid-format" : "invalid-key");
    let pubkey: string;
    try {
      pubkey = await getKeyVault().importPrivateKey(parsed.secretKey);
    } catch (e) {
      throw new LoginError("unavailable", { cause: e });
    } finally {
      parsed.secretKey.fill(0);
    }
    signInLocal(pubkey);
  },

  async generateNewKey() {
    const vault = getKeyVault();
    try {
      const pubkey = await vault.generate();
      // 保管した暗号文を復号して控えを作る（控えと保管した鍵が同じであることの確認も兼ねる）
      const nsec = await vault.withPrivateKey((sk) => (getPublicKey(sk) === pubkey ? nsecEncode(sk) : null));
      if (!nsec) throw new Error("stored key mismatch");
      return { pubkey, nsec };
    } catch (e) {
      throw new LoginError("unavailable", { cause: e });
    }
  },

  async loginWithNewKey(pubkey) {
    const stored = await getKeyVault()
      .storedPubkey()
      .catch(() => null);
    if (stored !== pubkey) throw new LoginError("unavailable");
    signInLocal(pubkey);
  },

  async loginWithBunker(input, signal) {
    let pubkey: string;
    try {
      ({ pubkey } = await connectBunker(input, signal));
    } catch (e) {
      throw nip46LoginError(e);
    }
    signInNip46(pubkey);
  },

  startNostrConnectLogin() {
    const { uri, done, cancel } = startNostrConnect();
    return {
      uri,
      cancel,
      done: done.then(
        ({ pubkey }) => signInNip46(pubkey),
        (e: unknown) => {
          throw nip46LoginError(e);
        },
      ),
    };
  },

  logout() {
    clearSaved();
    set(signedOut);
    void getKeyVault().clear();
    // [#543] パスキー保護中の nsec もログアウトで消す（今の local 行と同じ扱い）
    void getPasskeyVault().clear();
    void disconnectNip46();
    // [#537] Web は共用 PC のブラウザを想定し、ウォレットを動かせる接続情報を残さない
    void getNwcStore().clear();
  },

  async restore() {
    const saved = readSaved();
    if (saved?.method === "local") {
      const stored = await getKeyVault()
        .storedPubkey()
        .catch(() => null);
      if (stored === saved.pubkey) {
        set({ status: "in", method: "local", pubkey: saved.pubkey });
        return;
      }
      // [#543] local 行が無ければ、パスキーで保護された行(passkey)に切り替わっていないか確認する。
      // 見つかっても未解錠のまま開く（署名・復号はパスキーで解錠するまで拒否する）
      const passkeyPubkey = await getPasskeyVault()
        .storedPubkey()
        .catch(() => null);
      if (passkeyPubkey === saved.pubkey) {
        set({ status: "in", method: "local", pubkey: saved.pubkey });
        return;
      }
      clearSaved();
      // 別の鍵が残っていれば消す（null = 無い・壊れていて消した・保管先が使えない、のどれかなので触らない）
      if (stored !== null) void getKeyVault().clear();
      if (passkeyPubkey !== null) void getPasskeyVault().clear();
      set(signedOut);
      return;
    }
    if (saved?.method === "nip46") {
      // 保管した接続情報から張り直すだけ（署名アプリの応答は待たない）
      if (await restoreNip46(saved.pubkey).catch(() => false)) {
        set({ status: "in", method: "nip46", pubkey: saved.pubkey });
        return;
      }
      clearSaved();
      void disconnectNip46();
      set(signedOut);
      return;
    }
    if (saved) {
      try {
        const nostr = await waitForNostr();
        if (nostr && (await createNip07Signer().publicKey()) === saved.pubkey) {
          set({ status: "in", method: saved.method, pubkey: saved.pubkey });
          return;
        }
      } catch {
        // 拒否・例外は未ログインに戻す
      }
    }
    clearSaved();
    set(signedOut);
  },
}));

/** 保管した鍵でのログインを確定する（取り込み・新規生成の共通） */
function signInLocal(pubkey: string) {
  writeSaved({ method: "local", pubkey });
  useSession.setState({ status: "in", method: "local", pubkey });
  // リモート署名の接続の消し残しを掃除する
  void disconnectNip46();
  // [#543] "local" 行は fixed id で 1 端末 1 アカウントなので、別アカウントのパスキー保護は残っていても使えない
  void getPasskeyVault().clear();
  // ログイン直後に保存領域を消さないよう頼む（鍵の DB も同じオリジンの保存領域）
  void requestPersistentStorage();
}

/** リモート署名（NIP-46）でのログインを確定する（bunker:// と nostrconnect:// の共通） */
function signInNip46(pubkey: string) {
  writeSaved({ method: "nip46", pubkey });
  useSession.setState({ status: "in", method: "nip46", pubkey });
  // 前のローカル鍵・パスキー保護の消し残しを掃除する
  void getKeyVault().clear();
  void getPasskeyVault().clear();
  void requestPersistentStorage();
}

// Nip46Error の理由は同じ名前の LoginError にする（それ以外は rejected）
function nip46LoginError(e: unknown): LoginError {
  return new LoginError(e instanceof Nip46Error ? e.reason : "rejected", { cause: e });
}

/**
 * いまのセッションの署名者。未ログインなら null。署名者の解決はここ 1 か所。
 * [#543] local 行がパスキー(WebAuthn PRF)で保護されていて未解錠のときも、既存の「署名者が無い」経路と
 * 同じように null を返して失敗させる（呼び出し側はどこも signer が無い扱いで進む）
 */
export function currentSigner(): Signer | null {
  const { status, method, pubkey } = useSession.getState();
  if (status !== "in" || !pubkey) return null;
  if (method === "nip07") return createNip07Signer();
  if (method === "local") {
    const passkey = getPasskeyVault();
    if (passkey.isProtected()) {
      if (!passkey.isUnlocked()) {
        // パスキーで解錠するまで署名・復号を拒否する（ネイティブの NosskeyLockedException に相当）
        showToast(t("web_passkey_unlock_request"));
        return null;
      }
      return createLocalSigner(pubkey, passkey.asKeyVault());
    }
    return createLocalSigner(pubkey);
  }
  if (method === "nip46") return nip46Signer();
  return null;
}

function readSaved(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { method, pubkey } = value as Record<string, unknown>;
    if (method !== "nip07" && method !== "local" && method !== "nip46") return null;
    if (typeof pubkey !== "string" || !/^[0-9a-f]{64}$/.test(pubkey)) return null;
    return { method, pubkey };
  } catch {
    return null;
  }
}

function writeSaved(session: SavedSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(SESSION_FLAG_KEY, "1");
}

function clearSaved() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_FLAG_KEY);
}
