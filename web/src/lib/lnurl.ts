import { encodeBytes } from "nostr-tools/nip19";
import type { NostrEvent } from "nostr-tools/pure";
import { readRelays } from "../nostr/pool";
import { currentSigner } from "../signer/session";
import { unixNow } from "./time";

/**
 * LNURL-pay（LUD-06 / LUD-16）→ Zap invoice の取得（ネイティブ EventRepository.kt fetchLnurlPay /
 * requestZapInvoice / lnurlEncode の写し）。LNURL のエンドポイントはブラウザから直接叩く
 * （LUD-01 が CORS の許可を必須にしている。/api の中継はしない）。
 */

/** LNURL の取得のタイムアウト（メタ・callback それぞれ） */
export const LNURL_TIMEOUT_MS = 10_000;
/** zap request の relays タグに入れる読むリレーの数（ネイティブと同じ） */
export const ZAP_REQUEST_RELAYS = 6;

/** payRequest のメタ（NIP-57 の allowsNostr / nostrPubkey を含む）。金額は sats */
export type LnurlPay = {
  callback: string;
  minSats: number;
  maxSats: number;
  commentAllowed: number;
  allowsNostr: boolean;
  nostrPubkey: string | null;
};

/** lud16（name@domain）→ `https://<domain>/.well-known/lnurlp/<name>`。`@` が無い・先頭なら null */
export function lud16ToUrl(lud16: string): string | null {
  const value = lud16.trim();
  const at = value.indexOf("@");
  if (at <= 0) return null;
  return `https://${value.slice(at + 1)}/.well-known/lnurlp/${value.slice(0, at)}`;
}

/** lud16 → LNURL（上の URL の UTF-8 を bech32、hrp = lnurl）。zap request の lnurl タグ・パラメータ用 */
export function lnurlEncode(lud16: string): string | null {
  const url = lud16ToUrl(lud16);
  if (url === null) return null;
  try {
    return encodeBytes("lnurl", new TextEncoder().encode(url));
  } catch {
    return null;
  }
}

/** GET して JSON のオブジェクトを返す。通信・タイムアウト・JSON 不正は null（本文は HTTP の状態に関係なく読む） */
async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(LNURL_TIMEOUT_MS),
    });
    const json: unknown = await res.json();
    return typeof json === "object" && json !== null && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** lud16 の LNURL-pay メタ。tag が payRequest でない・callback が無い・取得失敗は null */
export async function fetchLnurlPay(lud16: string): Promise<LnurlPay | null> {
  const url = lud16ToUrl(lud16);
  if (url === null) return null;
  const o = await getJson(url);
  if (o === null || o.tag !== "payRequest") return null;
  if (typeof o.callback !== "string" || o.callback === "") return null;
  return {
    callback: o.callback,
    minSats: Math.floor(numberOr(o.minSendable, 1_000) / 1000),
    maxSats: Math.floor(numberOr(o.maxSendable, 100_000_000) / 1000),
    commentAllowed: Math.floor(numberOr(o.commentAllowed, 0)),
    allowsNostr: o.allowsNostr === true,
    nostrPubkey: typeof o.nostrPubkey === "string" && o.nostrPubkey !== "" ? o.nostrPubkey : null,
  };
}

function eventJson(e: NostrEvent): string {
  return JSON.stringify({
    id: e.id,
    pubkey: e.pubkey,
    created_at: e.created_at,
    kind: e.kind,
    tags: e.tags,
    content: e.content,
    sig: e.sig,
  });
}

export type ZapInvoiceRequest = {
  /** 受け取る人（p タグ） */
  recipient: string;
  lud16: string;
  amountSats: number;
  comment: string;
  /** 投稿への Zap（e タグ）。無ければプロフィール Zap */
  eventId?: string;
  /** 投稿の kind（k タグ。eventId があるときだけ） */
  targetKind?: number;
};

/**
 * Zap の invoice（bolt11）を取る。allowsNostr のサーバには kind:9734（zap request）を currentSigner() で署名して
 * `nostr` パラメータで添える（リレーへは発行しない）。そうでなければコメントを `comment` で送る（commentAllowed 文字まで）。
 * 応答の pr を返す。取得・署名の失敗、pr が無い応答は null
 */
export async function requestZapInvoice(req: ZapInvoiceRequest): Promise<string | null> {
  const pay = await fetchLnurlPay(req.lud16);
  if (pay === null) return null;
  const msat = req.amountSats * 1000;
  const lnurl = lnurlEncode(req.lud16);
  let url = `${pay.callback}${pay.callback.includes("?") ? "&" : "?"}amount=${msat}`;
  if (pay.allowsNostr && pay.nostrPubkey !== null) {
    const signer = currentSigner();
    if (signer === null) return null;
    const tags: string[][] = [
      ["relays", ...readRelays().slice(0, ZAP_REQUEST_RELAYS)],
      ["amount", String(msat)],
    ];
    if (lnurl !== null) tags.push(["lnurl", lnurl]);
    tags.push(["p", req.recipient]);
    if (req.eventId !== undefined) {
      tags.push(["e", req.eventId]);
      if (req.targetKind !== undefined) tags.push(["k", String(req.targetKind)]);
    }
    let zapRequest: NostrEvent;
    try {
      zapRequest = await signer.signEvent({ kind: 9734, content: req.comment, tags, created_at: unixNow() });
    } catch {
      return null;
    }
    url += `&nostr=${encodeURIComponent(eventJson(zapRequest))}`;
    if (lnurl !== null) url += `&lnurl=${lnurl}`;
  } else if (req.comment.trim() !== "" && pay.commentAllowed > 0) {
    // サロゲートペアの途中で切らない（切ると encodeURIComponent が例外を投げる）
    const cut = Array.from(req.comment).slice(0, pay.commentAllowed).join("");
    url += `&comment=${encodeURIComponent(cut)}`;
  }
  const res = await getJson(url);
  const pr = res?.pr;
  return typeof pr === "string" && pr !== "" ? pr : null;
}
