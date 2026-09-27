import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// アプリ（src/）のテストは jsdom で走らせる。
// Pages Functions のテスト（test/functions/、workerd で走る）は vitest.functions.config.ts（npm run test:functions）。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
