/**
 * ユーザー入力の URL を upstream に使う経路（/api/og）の取得（設計: #426 旧設計 7.3 節）。
 * guard.ts の fetchLimited は固定 upstream 用（リダイレクトを追わず、上限超過は失敗）。こちらは
 * - redirect: "manual" で最大 maxRedirects 回まで追い、各ホップで validateTargetUrl を再適用する
 * - 本文は上限で打ち切って先頭だけを返す（超過を失敗にしない）
 * - タイムアウトはリダイレクトと本文の読み取りを含めた全体で 1 つ
 */
import { validateTargetUrl } from "./guard";

export type GuardedFetchError =
  | "timeout" // 時間切れ
  | "unreachable" // 接続・読み取りの失敗
  | "redirect" // リダイレクトの回数超過・Location 無し・リダイレクト先が validateTargetUrl で拒否
  | "status" // リダイレクト以外の非 2xx
  | "content_type"; // 受け付けない Content-Type

export type GuardedFetch =
  | {
      ok: true;
      finalUrl: URL;
      mediaType: string;
      /** upstream の Content-Type ヘッダの値そのもの（charset 等のパラメータを含む。無ければ null）。 */
      contentType: string | null;
      body: Uint8Array;
    }
  | { ok: false; error: GuardedFetchError };

export interface GuardedFetchOptions {
  /** 送出ヘッダ。クライアントのヘッダは渡さない（Cookie/Authorization を転送しない）。 */
  headers: Record<string, string>;
  timeoutMs: number;
  maxRedirects: number;
  /** 自ホスト。リダイレクト先の validateTargetUrl に渡す（自分自身へのループを拒否する）。 */
  selfHost: string;
  /** Content-Type のメディアタイプ（小文字・パラメータ除去済み）を受け付けるか。 */
  acceptMediaType: (mediaType: string) => boolean;
  /** 最終 URL（リダイレクト後）に対する本文の上限バイト数。超える分は読まずに捨てる。 */
  maxBytes: (finalUrl: URL) => number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** url は validateTargetUrl を通したものを渡す。新規 Request で GET し、リダイレクトは各ホップで再検証して追う。 */
export async function fetchGuarded(url: URL, options: GuardedFetchOptions): Promise<GuardedFetch> {
  const signal = AbortSignal.timeout(options.timeoutMs);
  const failed = (e: unknown): GuardedFetch => ({
    ok: false,
    error:
      signal.aborted || (e as { name?: unknown } | null)?.name === "TimeoutError" ? "timeout" : "unreachable",
  });

  let current = url;
  for (let redirects = 0; ; redirects++) {
    let response: Response;
    try {
      response = await fetch(current.href, {
        method: "GET",
        headers: options.headers,
        redirect: "manual",
        signal,
      });
    } catch (e) {
      return failed(e);
    }
    const reject = async (error: GuardedFetchError): Promise<GuardedFetch> => {
      await response.body?.cancel().catch(() => {});
      return { ok: false, error };
    };

    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirects >= options.maxRedirects) return reject("redirect");
      const next = resolveLocation(response.headers.get("Location"), current, options.selfHost);
      if (next === null) return reject("redirect");
      await response.body?.cancel().catch(() => {});
      current = next;
      continue;
    }
    if (!response.ok) return reject("status");
    const contentType = response.headers.get("Content-Type");
    const mediaType = (contentType ?? "").split(";")[0].trim().toLowerCase();
    if (!options.acceptMediaType(mediaType)) return reject("content_type");

    try {
      const body = await readTruncated(response.body, options.maxBytes(current));
      return { ok: true, finalUrl: current, mediaType, contentType, body };
    } catch (e) {
      return failed(e);
    }
  }
}

/**
 * Location を現在の URL 基準で解決し、validateTargetUrl を通れば fragment を除いて返す
 * （無い・不正・拒否は null）。
 */
function resolveLocation(location: string | null, base: URL, selfHost: string): URL | null {
  if (location === null) return null;
  let resolved: URL;
  try {
    resolved = new URL(location, base);
  } catch {
    return null;
  }
  const checked = validateTargetUrl(resolved.href, selfHost);
  if (!checked.ok) return null;
  checked.url.hash = "";
  return checked.url;
}

/** 本文をストリームで先頭 maxBytes まで読み、残りは読まずに捨てる。 */
export async function readTruncated(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (body === null) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = Math.min(value.byteLength, maxBytes - total);
    chunks.push(take === value.byteLength ? value : value.subarray(0, take));
    total += take;
  }
  await reader.cancel().catch(() => {});
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
