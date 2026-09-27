/**
 * GET /api/nchan/channels（Pages Functions）。設計: #426。
 * 静的アセットでは Functions を起動しない（static/_routes.json で /api/* と /app/* の一部だけを通す）。
 */
import { fetchLimited, isJsonMediaType, isSameOrigin } from "../../../server/guard";
import { errorResponse, JSON_CONTENT_TYPE, jsonResponse } from "../../../server/http";

/**
 * NIP-28 チャンネル一覧の取得元。アプリの EventRepository.CHANNELS_ENDPOINT と同じ（固定。ユーザー入力は取らない）。
 */
const NCHAN_CHANNELS_UPSTREAM = "https://thread.nchan.vip/channels";
/** アプリはこのエンドポイントに独自 UA を付けていないため、Web 版として名乗る。 */
const UPSTREAM_USER_AGENT = "Nostrism-Web/0.1 (+https://nostrism.shino3.net)";
const UPSTREAM_TIMEOUT_MS = 5000;
const JSON_MAX_BYTES = 64 * 1024;
const NCHAN_CACHE_TTL_SEC = 60;

// 全メソッドを受け、GET 以外は handleNchanChannels が 405 を返す（onRequestGet だと POST 等は静的アセットへ落ちる）
export const onRequest: PagesFunction = (ctx) => handleNchanChannels(ctx.request, ctx);

/** thread.nchan.vip/channels の中継（60 秒キャッシュ・64KB 上限・5 秒タイムアウト）。 */
async function handleNchanChannels(
  request: Request,
  ctx: Pick<EventContext<unknown, string, unknown>, "waitUntil">,
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "method_not_allowed", { Allow: "GET" });
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");

  const cache = caches.default;
  const cacheKey = NCHAN_CHANNELS_UPSTREAM;
  const cached = await cache.match(cacheKey);
  if (cached) return jsonResponse(await cached.arrayBuffer());

  const result = await fetchLimited(NCHAN_CHANNELS_UPSTREAM, {
    headers: { "User-Agent": UPSTREAM_USER_AGENT, Accept: "application/json" },
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    maxBytes: JSON_MAX_BYTES,
    acceptMediaType: isJsonMediaType,
  });
  if (!result.ok) {
    return result.error === "timeout"
      ? errorResponse(504, "upstream_timeout")
      : errorResponse(502, `upstream_${result.error}`);
  }

  // キャッシュには max-age を付けたコピーを入れ、クライアントには no-store で返す
  ctx.waitUntil(
    cache.put(
      cacheKey,
      new Response(result.body, {
        headers: { "Content-Type": JSON_CONTENT_TYPE, "Cache-Control": `max-age=${NCHAN_CACHE_TTL_SEC}` },
      }),
    ),
  );
  return jsonResponse(result.body);
}
