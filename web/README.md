# Nostrism Web

Nostrism の Web 版（Vite + React + TypeScript の SPA）と、Cloudflare Pages で配信する `dist/` の組み立て。
計画: #426（改訂 4）。

- `/` など LP・プライバシーポリシー等は `docs/` の静的 HTML をそのまま配信する（`docs/` は変更しない）
- アプリは `/app/` 配下（Vite の `base: '/app/'`）
- `/api/*` は Pages Functions（#440 で `worker/` から移設予定）

## 構成

| パス | 中身 |
|---|---|
| `index.html` / `src/` | アプリ本体（Vite のエントリ）。`src/styles/global.css` がリポジトリ直下の `designs/tokens.css` を `@import` する（ビルド時にバンドルへ取り込まれる） |
| `static/` | `dist/` 直下へコピーする Pages 用ファイル（`_headers` `_redirects` `_routes.json` `404.html` `robots.txt`） |
| `scripts/assemble-dist.mjs` | `vite build` の後に `docs/` と `static/` を `dist/` へコピーする |
| `wrangler.toml` | Pages の設定（`pages_build_output_dir = "./dist"`） |
| `worker/` | 旧 Worker 版の `/api/*`。#440 で Pages Functions へ移すまで残す（テスト・型検査・lint の対象外） |

## ビルドの流れ（`npm run build`）

1. `vite build` → `dist/app/`（`emptyOutDir` は `dist/app` だけを消す）
2. `node scripts/assemble-dist.mjs`
   - `docs/` を `dist/` へ再帰コピー（`*.md` と `screenshots/` は除外。`.well-known/` と `store/` は含む）
   - `static/` を `dist/` へコピー（`docs/` に同名があれば `docs/` を優先して警告）
   - `dist/app/index.html` が無ければ exit 1
3. Pages は `dist/` を配信する

## 開発機での確認手順

Node は `~/.nvm` の v24（`.node-version`）。非対話シェルでは PATH が通っていないので先に読み込む。

```sh
source ~/.nvm/nvm.sh
cd ~/workspace/nostr-andloid-native-client/web && npm ci
npm run build                                       # dist/ を組み立て
ss -ltnp | grep -E ':(8788|5173)\b' || true          # 衝突確認
npx wrangler pages dev dist --ip 127.0.0.1 --port 8788 &   # 静的 + Functions（compat date は wrangler.toml）
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8788/app/anything      # 200
curl -s -H 'Sec-Fetch-Site: same-origin' http://127.0.0.1:8788/api/nchan/channels | head -c 200   # #440 以降
kill %1                                              # 必ず止める
```

`npm run preview` も同じ `wrangler pages dev`（127.0.0.1:8788）を起動する。

ホットリロード開発は `npm run dev`（Vite、`http://127.0.0.1:5173/app/`、`/api` は 8788 へ proxy）。
LP（`/`）は Vite dev では出ない（`base=/app/`）。**確認後は必ず止める。**

その他: `npm run lint`（Biome）/ `npm run format` / `npm run typecheck` / `npm test`（vitest + jsdom）。

## Cloudflare Pages ダッシュボード設定（ユーザー作業）

Workers & Pages → `nostr-andloid-native-client` → Settings。

| # | 場所 | 設定 | 値 |
|---|---|---|---|
| U-1 | Builds & deployments → Build configuration | Framework preset | None |
| U-2 | 同上 | **Root directory** | `web` |
| U-3 | 同上 | **Build command** | `npm ci && npm run build` |
| U-4 | 同上 | **Build output directory** | `dist`（Root directory 基準。`wrangler.toml` の `pages_build_output_dir` と一致させる） |
| U-5 | Environment variables | `NODE_VERSION` | `24`（`web/.node-version` を置くので原則不要。保険） |
| U-6 | Builds & deployments → **Configure Preview deployments** | Preview branch | **Custom branches** → Include: `web-dev`、Exclude: 空 |
| U-7 | Builds & deployments → Configure Production deployments | Production branch | `main`（現状のはず。変更しない）。自動デプロイは有効のまま |
| U-8 | Build → **Build watch paths** | Include | `web/*` と `docs/*`（Kotlin だけの merge ではビルドしない。Free は 500 build/月） |
