import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// アプリは /app/ 配下で配信する。dist/ の残り（LP・メタファイル）は scripts/assemble-dist.mjs が組み立てる。
export default defineConfig({
  base: "/app/",
  plugins: [
    react(),
    // SW と manifest は dist/app/ に出る（scope /app/ なので LP 等には効かない）。
    // injectRegister: null = 登録用の inline script を注入しない（CSP の script-src 'self'）。登録は UpdateToast の useRegisterSW
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["icons/*.png"],
      manifest: {
        id: "/app/",
        name: "Nostrism",
        short_name: "Nostrism",
        description: "デッキ型の Nostr クライアント（Web 版）",
        start_url: "/app/",
        scope: "/app/",
        display: "standalone",
        background_color: "#0C0C10",
        theme_color: "#0C0C10",
        lang: "ja",
        // public/icons/ は scripts/make-icons.mjs（npm run icons）で生成してコミットする
        icons: [
          { src: "/app/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/app/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/app/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/app/index.html",
        navigateFallbackAllowlist: [/^\/app\//],
        globPatterns: ["**/*.{js,css,html,png,svg,woff2,webmanifest}"],
        runtimeCaching: [],
      },
    }),
  ],
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
