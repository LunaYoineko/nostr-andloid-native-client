import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// アプリ（src/）のテストは jsdom で走らせる。
// worker/test（workerd で走る）は Pages Functions へ移すときに別設定（vitest.functions.config.ts）で戻す。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
