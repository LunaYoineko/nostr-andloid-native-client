import type { Filter } from "applesauce-core/helpers/filter";
import { Relay } from "applesauce-relay/relay";
import { PrivateKeySigner } from "applesauce-signers/signers/private-key-signer";
import { getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { hexToBytes } from "nostr-tools/utils";
import { unixNow } from "../../lib/time";

/**
 * [#537] NWC（Nostr Wallet Connect, NIP-47）接続情報。
 * `nostr+walletconnect://<wallet pubkey>?relay=wss://..&secret=<hex32byte>&lud16=..`
 * secret はクライアント（このアプリ）側の秘密鍵。ウォレットとの暗号化(NIP-04)と kind:23194 の署名に使う。
 * ネイティブ Nwc.kt の NwcConnection / parseNwcUri と同じ。
 */
export type NwcConnection = {
  walletPubkey: string;
  relayUrl: string;
  secretHex: string;
  lud16: string | null;
};

const HEX64 = /^[0-9a-f]{64}$/;

/** `nostr+walletconnect://`（旧 `nostrwalletconnect://` も許容）をパース。不正なら null */
export function parseNwcUri(uri: string): NwcConnection | null {
  const s = uri.trim();
  const rest = s.startsWith("nostr+walletconnect://")
    ? s.slice("nostr+walletconnect://".length)
    : s.startsWith("nostrwalletconnect://")
      ? s.slice("nostrwalletconnect://".length)
      : null;
  if (rest === null) return null;
  let url: URL;
  try {
    // pubkey は authority、残りはクエリ（URL のデコードをそのまま使う）
    url = new URL(`https://${rest}`);
  } catch {
    return null;
  }
  const walletPubkey = url.hostname.toLowerCase();
  if (!HEX64.test(walletPubkey)) return null;
  const relayUrl = url.searchParams.get("relay");
  const secretHex = url.searchParams.get("secret")?.toLowerCase() ?? null;
  if (!relayUrl || !secretHex || !HEX64.test(secretHex)) return null;
  return { walletPubkey, relayUrl, secretHex, lud16: url.searchParams.get("lud16") };
}

/** ウォレットの info(kind:13194) を待つ上限（ネイティブと同じ） */
export const NWC_INFO_TIMEOUT_MS = 10_000;
/** 1 往復の応答を待つ上限（ネイティブと同じ） */
export const NWC_REQUEST_TIMEOUT_MS = 60_000;
/** pay_invoice の応答を待つ上限（ウォレット側の処理待ちがあるため長め。ネイティブと同じ） */
export const NWC_PAY_TIMEOUT_MS = 90_000;

/**
 * invalid-uri = 接続文字列が読めない、no-info = ウォレットの info が届かない、
 * unsupported = info に pay_invoice が無い、timeout = 応答が無い、
 * wallet-error = ウォレットがエラー応答、unavailable = リレーに送れない・保管先が使えない
 */
export type NwcFailure =
  | "invalid-uri"
  | "no-info"
  | "unsupported"
  | "timeout"
  | "wallet-error"
  | "unavailable";

export class NwcError extends Error {
  readonly reason: NwcFailure;

  constructor(reason: NwcFailure, message?: string, options?: ErrorOptions) {
    super(message ?? reason, options);
    this.name = "NwcError";
    this.reason = reason;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** p だけ ms で打ち切る（応答は resolve のみ・reject しないので、タイマー切れだけが reject の理由になる） */
function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** NwcClient が使うリレーの受け口（applesauce-relay の Relay のうち使うところ）。テストでは偽物に差し替える */
export type NwcRelayLike = {
  challenge$: { subscribe(fn: (challenge: string | null) => void): { unsubscribe(): void } };
  subscription(filters: Filter[]): {
    subscribe(fn: (v: NostrEvent | "EOSE") => void): { unsubscribe(): void };
  };
  publish(event: NostrEvent): Promise<{ ok: boolean; message?: string }>;
  authenticate(signer: PrivateKeySigner): Promise<unknown>;
  close(): void;
};

export type NwcRelayFactory = (url: string) => NwcRelayLike;

let relayFactory: NwcRelayFactory = (url) => new Relay(url);

/** テスト専用: リレーの作り方を差し替える（実リレーに繋がない） */
export function setNwcRelayFactoryForTest(factory: NwcRelayFactory): void {
  relayFactory = factory;
}

/**
 * [#537] NWC の RPC チャネル。ウォレット指定のリレー1本へ kind:23194（NIP-04 暗号）を投げ、
 * kind:23195 の応答を **e タグ（リクエスト event id）** で待ち合わせる。
 * 構造はネイティブ Nwc.kt の NwcClient / web の signer/nip46.ts と同型。
 */
export class NwcClient {
  readonly clientPubkey: string;
  private readonly signer: PrivateKeySigner;
  private readonly relay: NwcRelayLike;
  private readonly pending = new Map<string, { resolve(v: Record<string, unknown>): void }>();
  private subSub: { unsubscribe(): void } | null = null;
  private authSub: { unsubscribe(): void } | null = null;
  private started = false;
  private methodsValue: string | null = null;
  private readonly info = deferred<string>();

  constructor(private readonly conn: NwcConnection) {
    const secretKey = hexToBytes(conn.secretHex);
    this.signer = new PrivateKeySigner(secretKey);
    this.clientPubkey = getPublicKey(secretKey);
    this.relay = relayFactory(conn.relayUrl);
  }

  /** ウォレットが広告する対応メソッド（info イベント、空白区切り）。届いていなければ null */
  get methods(): string | null {
    return this.methodsValue;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    // [NIP-42] AUTH チャレンジにクライアント鍵で応答（認証必須リレー対策）
    this.authSub = this.relay.challenge$.subscribe((challenge) => {
      if (challenge === null) return;
      this.relay.authenticate(this.signer).catch(() => {});
    });
    this.subSub = this.relay
      .subscription([
        { kinds: [23195], "#p": [this.clientPubkey] },
        { kinds: [13194], authors: [this.conn.walletPubkey], limit: 1 },
      ])
      .subscribe((msg) => {
        if (msg === "EOSE") return;
        void this.onEvent(msg);
      });
  }

  stop(): void {
    this.subSub?.unsubscribe();
    this.authSub?.unsubscribe();
    this.relay.close();
  }

  /** 接続検証: ウォレットの info イベントを待つ。届かなければ null（リレー/ウォレット設定ミスの疑い） */
  async awaitInfo(timeoutMs = NWC_INFO_TIMEOUT_MS): Promise<string | null> {
    return raceTimeout(this.info.promise, timeoutMs).catch(() => null);
  }

  private async onEvent(event: NostrEvent): Promise<void> {
    if (event.pubkey !== this.conn.walletPubkey) return;
    if (event.kind === 13194) {
      this.methodsValue = event.content;
      this.info.resolve(event.content);
      return;
    }
    if (event.kind !== 23195) return;
    const reqId = event.tags.find((t) => t[0] === "e" && t.length >= 2)?.[1];
    if (!reqId) return;
    const pending = this.pending.get(reqId);
    if (!pending) return;
    let plain: string;
    try {
      plain = await this.signer.nip04.decrypt(this.conn.walletPubkey, event.content);
    } catch {
      return;
    }
    let obj: unknown;
    try {
      obj = JSON.parse(plain);
    } catch {
      return;
    }
    if (!isRecord(obj)) return;
    this.pending.delete(reqId);
    pending.resolve(obj);
  }

  /**
   * RPC 1 往復。応答の error があれば NwcError("wallet-error")、無ければ result を返す。
   * 支払いはウォレット側で処理に時間がかかることがあるため timeout は長め。
   */
  async request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = NWC_REQUEST_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> {
    const content = await this.signer.nip04.encrypt(
      this.conn.walletPubkey,
      JSON.stringify({ method, params }),
    );
    const signed = await this.signer.signEvent({
      kind: 23194,
      created_at: unixNow(),
      tags: [["p", this.conn.walletPubkey]],
      content,
    });
    const { promise, resolve } = deferred<Record<string, unknown>>();
    this.pending.set(signed.id, { resolve });
    try {
      await this.relay.publish(signed);
    } catch (cause) {
      this.pending.delete(signed.id);
      throw new NwcError("unavailable", `wallet relay publish failed: ${this.conn.relayUrl}`, { cause });
    }
    let res: Record<string, unknown>;
    try {
      res = await raceTimeout(promise, timeoutMs);
    } catch {
      this.pending.delete(signed.id);
      throw new NwcError("timeout", `NWC response timeout: ${method}`);
    }
    const err = res.error;
    if (isRecord(err)) {
      const code = typeof err.code === "string" ? err.code : "UNKNOWN";
      const message = typeof err.message === "string" ? err.message : "";
      throw new NwcError("wallet-error", `wallet error [${code}] ${message}`);
    }
    return isRecord(res.result) ? res.result : {};
  }

  /** bolt11 invoice を支払う。成功で preimage（無いウォレットは空文字）を返す */
  async payInvoice(invoice: string): Promise<string> {
    const result = await this.request("pay_invoice", { invoice }, NWC_PAY_TIMEOUT_MS);
    return typeof result.preimage === "string" ? result.preimage : "";
  }
}
