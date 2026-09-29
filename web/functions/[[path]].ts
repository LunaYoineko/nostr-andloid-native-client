/**
 * 全パスの SPA フォールバック（#647。旧 /app/* から拡張）。_redirects の rewrite は実在ファイルより先に適用され、
 * JS/CSS まで index.html になるため Functions で行う。
 * /api/* は functions/api/[[path]].ts 等、より具体的な Functions が先に処理する（Pages のルーティングは
 * 具体的なパスを優先する）。静的ファイル（/assets/* 等）は static/_routes.json で除外しているので、
 * ここには来ない。
 * - 静的アセットにあればその応答をそのまま返す（404 以外はすべて素通し）
 * - 404 で、GET/HEAD のページ遷移（Accept に text/html、または Sec-Fetch-Dest: document）なら index.html を返す
 * - それ以外は 404 をそのまま返す
 *
 * フォールバック先は "/index.html" ではなく "/"（末尾スラッシュ）で取得する。ASSETS の解決は
 * "/index.html" をそのまま渡すと「拡張子なしの正規 URL（/）へ 308 リダイレクト」する挙動（clean URL
 * 正規化）があり、末尾スラッシュの "/" ならその挙動を経由せず index.html の内容を 200 でそのまま返す。
 *
 * アプリのルートの X-Robots-Tag は static/_headers ではなくここで付ける。_headers のパス指定ヘッダーは
 * ASSETS.fetch() に渡した URL（このフォールバックでは常に "/"）に紐づくため、元のリクエストパスが
 * /login 等でも "/" 分の（noindex の無い）ヘッダーが返ってしまい、個別ルートには実際には効かない。
 */
import type { Env } from "../server/env";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const pathname = new URL(ctx.request.url).pathname;
  const response = await ctx.env.ASSETS.fetch(ctx.request);
  if (response.status !== 404 || !isPageNavigation(ctx.request)) return withNoindex(response, pathname);
  await response.body?.cancel();
  const fallback = await ctx.env.ASSETS.fetch(new Request(new URL("/", ctx.request.url), ctx.request));
  return withNoindex(fallback, pathname);
};

function isPageNavigation(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (request.headers.get("Sec-Fetch-Dest") === "document") return true;
  return (request.headers.get("Accept") ?? "").includes("text/html");
}

// static/_headers の「アプリのルート」の一覧と揃える（/login, /settings/*, /messages/*, /e/*, /p/*, /t/*, /share, /open, /404）
const NOINDEX_EXACT = new Set(["/login", "/share", "/open", "/404"]);
const NOINDEX_PREFIXES = ["/settings/", "/messages/", "/e/", "/p/", "/t/"];

function needsNoindex(pathname: string): boolean {
  return NOINDEX_EXACT.has(pathname) || NOINDEX_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function withNoindex(response: Response, pathname: string): Response {
  if (!needsNoindex(pathname) || response.headers.has("X-Robots-Tag")) return response;
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
