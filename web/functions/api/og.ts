/**
 * GET /api/og?url=<https URL>（Pages Functions）。設計: #426（6.5 節、旧設計 7.2・7.3 節）。
 * リンクカード用に対象ページの HTML 先頭を取得し、解析せずに返す（OGP の解析はクライアント側）。
 * 自オリジンで HTML として描画されないよう text/plain + nosniff で返す。文字コードは変換しない
 * （クライアントが <meta charset> を見てデコードする）。
 */
import { fetchGuarded } from "../../server/fetchGuarded";
import { isSameOrigin, validateTargetUrl } from "../../server/guard";
import { errorResponse, JSON_CONTENT_TYPE, jsonResponse } from "../../server/http";

/** アプリの EventRepository.OGP_UA と同じ（ブラウザ風 UA を名乗らないと Amazon 等がボット扱いで簡易ページを返す）。 */
const OGP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const UPSTREAM_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
/** 本文の打ち切り（アプリの fetchOgp と同じ値）。Amazon は商品画像の JSON がページ後半に来るため緩和する。 */
const HTML_MAX_BYTES = 200_000;
const AMAZON_HTML_MAX_BYTES = 512_000;
const OG_CACHE_TTL_SEC = 24 * 60 * 60;
const OG_NEGATIVE_CACHE_TTL_SEC = 10 * 60;
const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";
/** リダイレクト後の最終 URL（クライアントが相対 URL の解決に使う）。 */
const FINAL_URL_HEADER = "X-Og-Final-Url";
/** upstream の Content-Type の値そのもの（<meta charset> が無いページの文字コードをクライアントが知るため）。 */
const UPSTREAM_CONTENT_TYPE_HEADER = "X-Og-Upstream-Content-Type";
/**
 * ネガティブキャッシュの元ステータス。Cache API は 200 以外を保存しないことがあるため、
 * 失敗も 200 で保存してステータスはこのヘッダに持つ（クライアントへは出さない）。
 */
const CACHED_ERROR_STATUS_HEADER = "X-Og-Error-Status";

// 全メソッドを受け、GET 以外は handleOg が 405 を返す（onRequestGet だと POST 等は静的アセットへ落ちる）
export const onRequest: PagesFunction = (ctx) => handleOg(ctx.request, ctx);

/** 対象 URL の HTML 先頭を text/plain で中継する（24 時間キャッシュ・失敗は 10 分のネガティブキャッシュ）。 */
async function handleOg(
  request: Request,
  ctx: Pick<EventContext<unknown, string, unknown>, "waitUntil">,
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "method_not_allowed", { Allow: "GET" });
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");

  const requestUrl = new URL(request.url);
  const input = requestUrl.searchParams.get("url");
  const checked = input === null ? null : validateTargetUrl(input, requestUrl.host);
  if (checked === null || !checked.ok) return errorResponse(400, "invalid_url");
  const target = checked.url;
  target.hash = "";

  const cache = caches.default;
  const cacheKey = ogCacheKey(requestUrl, target);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const errorStatus = cached.headers.get(CACHED_ERROR_STATUS_HEADER);
    if (errorStatus !== null) return jsonResponse(await cached.arrayBuffer(), Number(errorStatus));
    return textResponse(
      await cached.arrayBuffer(),
      upstreamHeaders(
        cached.headers.get(FINAL_URL_HEADER) ?? target.href,
        cached.headers.get(UPSTREAM_CONTENT_TYPE_HEADER),
      ),
    );
  }

  const result = await fetchGuarded(target, {
    headers: {
      "User-Agent": OGP_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ja,en;q=0.8",
    },
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    maxRedirects: MAX_REDIRECTS,
    selfHost: requestUrl.host,
    acceptMediaType: (mediaType) => mediaType === "text/html" || mediaType === "application/xhtml+xml",
    maxBytes: (finalUrl) => (finalUrl.hostname.includes("amazon.") ? AMAZON_HTML_MAX_BYTES : HTML_MAX_BYTES),
  });
  if (!result.ok) {
    const [status, code] =
      result.error === "timeout"
        ? [504, "upstream_timeout"]
        : result.error === "content_type"
          ? [415, "upstream_content_type"]
          : [502, `upstream_${result.error}`];
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(JSON.stringify({ error: code }), {
          headers: {
            "Content-Type": JSON_CONTENT_TYPE,
            "Cache-Control": `max-age=${OG_NEGATIVE_CACHE_TTL_SEC}`,
            [CACHED_ERROR_STATUS_HEADER]: String(status),
          },
        }),
      ),
    );
    return errorResponse(status, code);
  }

  const upstream = upstreamHeaders(result.finalUrl.href, result.contentType);
  // キャッシュには max-age を付けたコピーを入れ、クライアントには no-store で返す
  ctx.waitUntil(
    cache.put(
      cacheKey,
      new Response(result.body, {
        headers: {
          "Content-Type": TEXT_CONTENT_TYPE,
          "Cache-Control": `max-age=${OG_CACHE_TTL_SEC}`,
          ...upstream,
        },
      }),
    ),
  );
  return textResponse(result.body, upstream);
}

/** 最終 URL と upstream の Content-Type（無ければ付けない）。クライアントへの応答とキャッシュの両方に付ける。 */
function upstreamHeaders(finalUrl: string, upstreamContentType: string | null): Record<string, string> {
  return upstreamContentType === null
    ? { [FINAL_URL_HEADER]: finalUrl }
    : { [FINAL_URL_HEADER]: finalUrl, [UPSTREAM_CONTENT_TYPE_HEADER]: upstreamContentType };
}

/**
 * キャッシュのキー。正規化した対象 URL（fragment 除去済み）を自オリジンの /api/og 配下に置く。
 * 対象 URL をそのままキーにすると、他の /api/* が upstream URL をキーにしたエントリと衝突する。
 */
function ogCacheKey(requestUrl: URL, target: URL): string {
  const key = new URL("/api/og", requestUrl.origin);
  key.searchParams.set("url", target.href);
  return key.href;
}

function textResponse(body: BodyInit, upstream: Record<string, string>): Response {
  return new Response(body, {
    headers: {
      "Content-Type": TEXT_CONTENT_TYPE,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      ...upstream,
    },
  });
}
