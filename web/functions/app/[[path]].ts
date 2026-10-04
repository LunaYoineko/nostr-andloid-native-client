/**
 * 旧 /app 配下（#647 で廃止）。
 * - /app/sw.js: インストール済み PWA に残る旧 Service Worker（scope /app/）の更新先。301 にすると更新に失敗して
 *   旧 SW がキャッシュした古いアプリを出し続けるため、ここでは「キャッシュを消し、自分を解除し、開いている
 *   ウィンドウを / へ移す」だけの SW を 200 で返す（no-cache。Service Worker のスクリプトはリダイレクトを追わない）。
 * - それ以外: /app/foo?x → /foo?x へ 301（インストール済み PWA の start_url と外部の古いリンク向け）。
 * _redirects ではなくここで行う（_redirects と Functions の評価順に依存せず、/app/sw.js の例外を確実にするため）。
 */
import type { Env } from "../../server/env";

export const LEGACY_SW_SCRIPT = `self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",(event)=>{event.waitUntil((async()=>{
try{const keys=await caches.keys();await Promise.all(keys.map((k)=>caches.delete(k)));}catch{}
try{await self.registration.unregister();}catch{}
try{const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
for(const c of clients){try{const u=new URL(c.url);if(u.pathname.startsWith("/app")){u.pathname=u.pathname.replace(/^/app/?/,"/");await c.navigate(u.href);}}catch{}}}catch{}
})());});
`;

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  if (url.pathname === "/app/sw.js") {
    return new Response(LEGACY_SW_SCRIPT, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Robots-Tag": "noindex",
      },
    });
  }
  const target = new URL(url.pathname.replace(/^\/app\/?/, "/") + url.search, url.origin);
  return Response.redirect(target.toString(), 301);
};
