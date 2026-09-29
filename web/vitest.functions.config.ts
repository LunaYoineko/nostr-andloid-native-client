import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Pages Functions（functions/ と server/）のテストは Workers ランタイム（workerd）内で走る。
// compatibility_date は wrangler.toml から読む。
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      // ASSETS は Pages が付けるバインディングで、Pages 形式の wrangler.toml では定義されない
      // （createPagesEventContext() は ASSETS が無いと例外を投げる）。静的アセットのフェイクで代える。
      miniflare: { serviceBindings: { ASSETS: (request) => fakeAssets(new URL(request.url).pathname) } },
    }),
  ],
  test: {
    include: ["test/functions/**/*.test.ts"],
  },
});

/** /・/index.html・/assets/a.css だけがある静的アセット。本文は test/functions/fallback.test.ts が照合する。 */
function fakeAssets(pathname: string): Response {
  switch (pathname) {
    case "/":
    case "/index.html":
      return new Response("<!doctype html><title>app</title>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    case "/assets/a.css":
      return new Response("body{}", { headers: { "Content-Type": "text/css; charset=utf-8" } });
    default:
      return new Response("not found", {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
  }
}
