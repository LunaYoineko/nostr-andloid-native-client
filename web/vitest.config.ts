import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

// アプリ（src/）のテストは jsdom で走らせる。
// Pages Functions のテスト（workerd）は vitest.functions.config.ts。
// VitePWA は `virtual:pwa-register/react` を解決するためだけに入れる（テストでは何もしない dev 用スタブになる）。
export default defineConfig({
  plugins: [react(), VitePWA({ injectRegister: null })],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
