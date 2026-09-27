/**
 * /api/* プロキシの悪用対策（設計: #426 7.3 節）。
 * - validateTargetUrl: ユーザー入力の URL を upstream に使う経路（/api/og 等）の SSRF 対策
 * - isSameOrigin: 他サイトのブラウザからの流用を防ぐ同一オリジン確認
 * - readLimited / fetchLimited: サイズ・時間制限つきの upstream 取得
 */

export type UrlValidation = { ok: true; url: URL } | { ok: false; reason: string };

export const MAX_TARGET_URL_LENGTH = 2048;

/** 名前解決の対象にしない特殊用途のホスト（完全一致またはサフィックス一致）。 */
const BLOCKED_HOST_SUFFIXES = ["localhost", "local", "internal", "arpa"];

/**
 * upstream に渡してよい URL か検証する。
 * https のみ / ポート 443 のみ / IP リテラル・特殊用途ホスト・単一ラベル・自ホストを拒否 / userinfo 拒否 / 2048 文字以下。
 */
export function validateTargetUrl(input: string, selfHost: string): UrlValidation {
  if (input.length > MAX_TARGET_URL_LENGTH) return { ok: false, reason: "too_long" };
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "scheme" };
  // WHATWG URL は https の既定ポート 443 を空文字に正規化する
  if (url.port !== "") return { ok: false, reason: "port" };
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "userinfo" };

  const host = normalizeHost(url.hostname);
  if (host === "") return { ok: false, reason: "invalid_host" };
  if (isIpLiteral(host)) return { ok: false, reason: "ip_literal" };
  if (BLOCKED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) {
    return { ok: false, reason: "blocked_host" };
  }
  if (!host.includes(".")) return { ok: false, reason: "single_label" };
  if (host === normalizeHost(stripPort(selfHost))) return { ok: false, reason: "self_host" };
  return { ok: true, url };
}

/** 小文字化し、末尾のドット（FQDN 表記）を落とす。 */
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.+$/, "");
}

function stripPort(host: string): string {
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
  const i = host.lastIndexOf(":");
  return i >= 0 ? host.slice(0, i) : host;
}

/**
 * IPv6（[...]）と IPv4 を判定する。URL パーサは 10 進整数・16 進・8 進表記の IPv4 を
 * ドット 10 進へ正規化するが、多層で最終ラベルが数値のホストも IP 扱いにする。
 */
function isIpLiteral(host: string): boolean {
  if (host.startsWith("[") || host.includes(":")) return true;
  const last = host.slice(host.lastIndexOf(".") + 1);
  return /^(?:0x[0-9a-f]*|\d+)$/i.test(last);
}

/**
 * 同一オリジンからのリクエストか。信頼できるヘッダから順に 1 つだけで判定する:
 * `Sec-Fetch-Site` があればそれが `same-origin` か → 無ければ `Origin` のホスト一致 →
 * どちらも無ければ `Referer` のホスト一致。上位のヘッダが不一致なら下位では救済しない。
 * curl 等では偽装できるが、他サイトのブラウザからの流用を防ぐ。
 */
export function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite !== null) return fetchSite === "same-origin";
  const selfHost = new URL(request.url).host;
  const origin = request.headers.get("Origin");
  if (origin !== null) return hostOf(origin) === selfHost;
  const referer = request.headers.get("Referer");
  return referer !== null && hostOf(referer) === selfHost;
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null; // "null" や不正な値
  }
}

export type LimitedRead = { ok: true; bytes: Uint8Array } | { ok: false; reason: "too_large" };

/** 本文をストリームで読み、maxBytes を超えた時点で打ち切る（超過は ok: false）。 */
export async function readLimited(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<LimitedRead> {
  if (body === null) return { ok: true, bytes: new Uint8Array(0) };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, reason: "too_large" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

export type LimitedFetchError =
  | "timeout" // 時間切れ
  | "unreachable" // 接続・読み取りの失敗
  | "redirect" // 3xx（redirect: "manual"）
  | "status" // 3xx 以外の非 2xx
  | "content_type" // 受け付けない Content-Type
  | "too_large"; // 本文が上限超過

export type LimitedFetch =
  | { ok: true; status: number; mediaType: string; body: Uint8Array }
  | { ok: false; error: LimitedFetchError };

export interface LimitedFetchOptions {
  /** 送出ヘッダ。クライアントのヘッダは渡さない（Cookie/Authorization を転送しない）。 */
  headers: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
  /** Content-Type のメディアタイプ（小文字・パラメータ除去済み）を受け付けるか。 */
  acceptMediaType: (mediaType: string) => boolean;
}

/** 新規 Request で GET し、リダイレクトは追わず、時間・サイズ・Content-Type を制限して本文を読む。 */
export async function fetchLimited(url: string, options: LimitedFetchOptions): Promise<LimitedFetch> {
  const signal = AbortSignal.timeout(options.timeoutMs);
  const failed = (e: unknown): LimitedFetch => ({
    ok: false,
    error:
      signal.aborted || (e as { name?: unknown } | null)?.name === "TimeoutError" ? "timeout" : "unreachable",
  });

  let response: Response;
  try {
    response = await fetch(url, { method: "GET", headers: options.headers, redirect: "manual", signal });
  } catch (e) {
    return failed(e);
  }
  const reject = async (error: LimitedFetchError): Promise<LimitedFetch> => {
    await response.body?.cancel().catch(() => {});
    return { ok: false, error };
  };
  if (response.status >= 300 && response.status < 400) return reject("redirect");
  if (!response.ok) return reject("status");
  const mediaType = (response.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!options.acceptMediaType(mediaType)) return reject("content_type");

  try {
    const read = await readLimited(response.body, options.maxBytes);
    if (!read.ok) return { ok: false, error: "too_large" };
    return { ok: true, status: response.status, mediaType, body: read.bytes };
  } catch (e) {
    return failed(e);
  }
}

/** application/json と application/*+json を JSON とみなす。 */
export function isJsonMediaType(mediaType: string): boolean {
  return mediaType === "application/json" || /^application\/[a-z0-9.!#$&^_-]+\+json$/.test(mediaType);
}
