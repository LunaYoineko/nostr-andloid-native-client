import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Pages Functions（functions/ と server/）のテストは Workers ランタイム（workerd）内で走る。
// compatibility_date は wrangler.toml から読む。
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      // createPagesEventContext() は ASSETS バインディングを要求する（Pages 形式の wrangler.toml では定義されない）。
      // テストする Functions は静的アセットへ流さないため、常に 404 を返すスタブで足りる。
      miniflare: { serviceBindings: { ASSETS: () => new Response(null, { status: 404 }) } },
    }),
  ],
  test: {
    include: ["test/functions/**/*.test.ts"],
  },
});
