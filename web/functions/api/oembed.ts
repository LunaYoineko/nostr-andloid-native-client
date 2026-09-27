/**
 * GET /api/oembed?v=<YouTube videoId>（Pages Functions）。設計: #426（6.5 節、旧設計 7.3 節）。
 * YouTube 埋め込みカードのタイトル帯用に oEmbed を中継する（upstream 固定。ユーザー入力は videoId だけ）。
 */
import { fetchLimited, isJsonMediaType, isSameOrigin } from "../../server/guard";
import { errorResponse, JSON_CONTENT_TYPE, jsonResponse } from "../../server/http";

/** YouTube の videoId（11 文字）。これ以外は upstream に渡さない。 */
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
/** アプリの EventRepository.fetchYouTubeInfo と同じ URL。 */
const oembedUpstream = (videoId: string) =>
  `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${videoId}&format=json`;
/** アプリはこのエンドポイントに独自 UA を付けていないため、Web 版として名乗る。 */
const UPSTREAM_USER_AGENT = "Nostrism-Web/0.1 (+https://nostrism.shino3.net)";
const UPSTREAM_TIMEOUT_MS = 5000;
const JSON_MAX_BYTES = 64 * 1024;
const OEMBED_CACHE_TTL_SEC = 24 * 60 * 60;

// 全メソッドを受け、GET 以外は handleOembed が 405 を返す（onRequestGet だと POST 等は静的アセットへ落ちる）
export const onRequest: PagesFunction = (ctx) => handleOembed(ctx.request, ctx);

/** YouTube oEmbed の中継（24 時間キャッシュ・64KB 上限・5 秒タイムアウト）。 */
async function handleOembed(
  request: Request,
  ctx: Pick<EventContext<unknown, string, unknown>, "waitUntil">,
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "method_not_allowed", { Allow: "GET" });
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");

  const videoId = new URL(request.url).searchParams.get("v");
  if (videoId === null || !VIDEO_ID_PATTERN.test(videoId)) return errorResponse(400, "invalid_video_id");

  const upstream = oembedUpstream(videoId);
  const cache = caches.default;
  const cached = await cache.match(upstream);
  if (cached) return jsonResponse(await cached.arrayBuffer());

  const result = await fetchLimited(upstream, {
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
      upstream,
      new Response(result.body, {
        headers: { "Content-Type": JSON_CONTENT_TYPE, "Cache-Control": `max-age=${OEMBED_CACHE_TTL_SEC}` },
      }),
    ),
  );
  return jsonResponse(result.body);
}
