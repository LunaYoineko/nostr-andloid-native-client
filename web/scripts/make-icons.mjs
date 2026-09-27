// PWA のアイコンを docs/store/icon-512.png（512×512 RGB）から生成する。`npm run icons` で手動実行する。
//   public/icons/icon-192.png     … 192×192（manifest の any・apple-touch-icon）
//   public/icons/icon-512.png     … 512×512（manifest の any）
//   public/icons/maskable-512.png … 512×512（manifest の maskable。元画像を安全域 80% に縮小し、周囲を #0C0C10 で埋める）
// 生成物はコミットする（Pages のビルドでは実行しない。sharp は devDependencies だがビルドに不要）。
// リポジトリルートからでも web/ からでも動く（パスはスクリプトの位置から解決）。
import { mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const webDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoDir = dirname(webDir);
const source = join(repoDir, "docs", "store", "icon-512.png");
const outDir = join(webDir, "public", "icons");

const SIZE = 512;
// maskable の安全域（直径 80% の円）に収める
const SAFE_SIZE = Math.round(SIZE * 0.8);
// manifest の background_color と同じ（tokens.css の --bg）
const BACKGROUND = "#0C0C10";

mkdirSync(outDir, { recursive: true });

async function write(name, image) {
  const file = join(outDir, name);
  await image.png().toFile(file);
  console.log(`make-icons: ${relative(webDir, file)}`);
}

await write("icon-192.png", sharp(source).resize(192, 192));
await write("icon-512.png", sharp(source).resize(SIZE, SIZE));

// 縮小して中央に置き、余白を背景色で埋める
const before = Math.floor((SIZE - SAFE_SIZE) / 2);
const after = SIZE - SAFE_SIZE - before;
await write(
  "maskable-512.png",
  sharp(source)
    .resize(SAFE_SIZE, SAFE_SIZE)
    .extend({ top: before, bottom: after, left: before, right: after, background: BACKGROUND }),
);
