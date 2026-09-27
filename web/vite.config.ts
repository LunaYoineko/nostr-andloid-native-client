import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// アプリは /app/ 配下で配信する。dist/ の残り（LP・メタファイル）は scripts/assemble-dist.mjs が組み立てる。
export default defineConfig({
  base: "/app/",
  plugins: [react()],
  build: {
    outDir: "dist/app",
    // dist/app だけを消す（dist/ 直下の LP 等は assemble-dist.mjs が上書きコピーする）
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    // ../designs/tokens.css を @import するため、web/ の外（リポジトリ直下）の読み取りを許す
    fs: { allow: [".."] },
    // /api/* は wrangler pages dev（8788）へ
    proxy: { "/api": "http://127.0.0.1:8788" },
  },
});
