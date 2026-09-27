import { create } from "zustand";
import { createNip07Signer } from "../nostr/signer";
import { waitForNostr } from "./nip07";

/** 保存するセッション（{"method":"nip07","pubkey":"<hex>"}）。秘密鍵は入れない */
export const SESSION_KEY = "nostrism.session";
/** LP がログイン済みかだけを判定するためのマーカー（値は "1"） */
export const SESSION_FLAG_KEY = "nostrism.session.flag";

export type SessionStatus = "loading" | "out" | "in";
export type SessionMethod = "nip07";

type SavedSession = { method: SessionMethod; pubkey: string };

/** ログイン失敗の理由。missing = 拡張が見つからない（待ち時間切れ）、rejected = 拒否・失敗 */
export type LoginFailure = "missing" | "rejected";

export class LoginError extends Error {
  readonly reason: LoginFailure;

  constructor(reason: LoginFailure, options?: ErrorOptions) {
    super(reason === "missing" ? "NIP-07 extension not found" : "NIP-07 login failed", options);
    this.name = "LoginError";
    this.reason = reason;
  }
}

type SessionState = {
  status: SessionStatus;
  method: SessionMethod | null;
  pubkey: string | null;
  /** 拡張機能（NIP-07）でログインする。失敗時は LoginError を投げる */
  login(): Promise<void>;
  logout(): void;
  /** 起動時に保存済みセッションを復元する。拡張の公開鍵と一致しなければ未ログインへ戻す */
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
  },

  logout() {
    clearSaved();
    set(signedOut);
  },

  async restore() {
    const saved = readSaved();
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

function readSaved(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { method, pubkey } = value as Record<string, unknown>;
    if (method !== "nip07" || typeof pubkey !== "string") return null;
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
