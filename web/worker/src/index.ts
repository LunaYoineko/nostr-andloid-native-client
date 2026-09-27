/**
 * Nostrism Web の Worker。静的アセット（LP + /app/）は Static Assets が返し、
 * この Worker は /api/* だけを処理する（wrangler.toml の run_worker_first）。設計: #426 7 章。
 */
import { fetchLimited, isJsonMediaType, isSameOrigin } from "./guard";

export interface Env {
  ASSETS: Fetcher;
}

/**
 * NIP-28 チャンネル一覧の取得元。アプリの EventRepository.CHANNELS_ENDPOINT と同じ（固定。ユーザー入力は取らない）。
 * メインモジュールの named export は workerd がエントリポイント扱いするため export しない。
 */
const NCHAN_CHANNELS_UPSTREAM = "https://thread.nchan.vip/channels";
/** アプリはこのエンドポイントに独自 UA を付けていないため、Web 版として名乗る。 */
const UPSTREAM_USER_AGENT = "Nostrism-Web/0.1 (+https://nostrism.shino3.net)";
const UPSTREAM_TIMEOUT_MS = 5000;
const JSON_MAX_BYTES = 64 * 1024;
const NCHAN_CACHE_TTL_SEC = 60;

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    // run_worker_first で通常は /api/* しか来ないが、保険として静的アセットへ流す
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (pathname === "/api/nchan/channels") return handleNchanChannels(request, ctx);
    return errorResponse(404, "not_found");
  },
} satisfies ExportedHandler<Env>;

/** GET /api/nchan/channels: thread.nchan.vip/channels の中継（60 秒キャッシュ・64KB 上限・5 秒タイムアウト）。 */
async function handleNchanChannels(request: Request, ctx: ExecutionContext): Promise<Response> {
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

function jsonResponse(body: BodyInit, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": JSON_CONTENT_TYPE,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function errorResponse(status: number, code: string, extraHeaders: Record<string, string> = {}): Response {
  return jsonResponse(JSON.stringify({ error: code }), status, extraHeaders);
}
