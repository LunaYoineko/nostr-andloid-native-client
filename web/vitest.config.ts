import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// テストは Workers ランタイム（workerd）内で走る。設定は wrangler.toml から読む。
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.toml" } })],
  test: {
    include: ["worker/test/**/*.test.ts"],
  },
});
