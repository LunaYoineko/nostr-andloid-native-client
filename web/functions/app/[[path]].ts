/**
 * /app/ 配下の SPA フォールバック。_redirects の rewrite は実在ファイルより先に適用され、
 * JS/CSS まで index.html になるため Functions で行う。
 * 静的ファイル（/app/assets/* 等）は static/_routes.json で除外しているので、ここには来ない。
 * - 静的アセットにあればその応答をそのまま返す（404 以外はすべて素通し）
 * - 404 で、GET/HEAD のページ遷移（Accept に text/html、または Sec-Fetch-Dest: document）なら /app/ の index.html を返す
 * - それ以外は 404 をそのまま返す
 */
import type { Env } from "../../server/env";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const response = await ctx.env.ASSETS.fetch(ctx.request);
  if (response.status !== 404 || !isPageNavigation(ctx.request)) return response;
  await response.body?.cancel();
  return ctx.env.ASSETS.fetch(new Request(new URL("/app/", ctx.request.url), ctx.request));
};

function isPageNavigation(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (request.headers.get("Sec-Fetch-Dest") === "document") return true;
  return (request.headers.get("Accept") ?? "").includes("text/html");
}
