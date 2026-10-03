// ネイティブの strings.xml から、Web の t() が参照しているキーだけを native.ja.json / native.en.json に書き出す。
//   node scripts/import-strings.mjs          書き出す（手で動かし、結果をコミットする）
//   node scripts/import-strings.mjs --check  コミット済みの辞書が最新か確かめる（違えば非 0）
//   node scripts/import-strings.mjs --candidates  Web の日本語リテラルと values-ja の値が完全一致するキーを出す
// Kotlin / Gradle は動かさない（strings.xml をファイルとして読むだけ）。
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const resDir = join(webRoot, "..", "composeApp/src/commonMain/composeResources");
const outDir = join(webRoot, "src/i18n");

/** strings.xml → { key: value }（translatable="false" は除く。XML 実体参照と Android のエスケープを戻す） */
export function parseStringsXml(xml) {
  const out = {};
  const re = /<string\s+name="([^"]+)"([^>]*)>([\s\S]*?)<\/string>/g;
  for (const m of xml.matchAll(re)) {
    if (/translatable="false"/.test(m[2])) continue;
    out[m[1]] = unescapeValue(m[3]);
  }
  return out;
}

function unescapeValue(raw) {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(Number.parseInt(h, 16)))
    .replace(/\\n/g, "\n")
    .replace(/\\(["'@?\\])/g, "$1");
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** web/src の本体コード（テスト以外）が t("key") で参照しているキー */
export function usedKeys(srcDir = join(webRoot, "src")) {
  const keys = new Set();
  for (const file of walk(srcDir)) {
    if (!/\.(ts|tsx)$/.test(file) || /\.test\.(ts|tsx)$/.test(file)) continue;
    if (relative(srcDir, file).startsWith("i18n/")) continue;
    for (const m of readFileSync(file, "utf8").matchAll(/\bt\(\s*["']([A-Za-z0-9_]+)["']/g)) keys.add(m[1]);
  }
  return keys;
}

function pick(dict, keys) {
  const out = {};
  for (const k of [...keys].sort()) if (k in dict) out[k] = dict[k];
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** 書き出す内容（ファイル名 → テキスト）。決定的（キー順固定） */
export function build() {
  const ja = parseStringsXml(readFileSync(join(resDir, "values-ja/strings.xml"), "utf8"));
  const en = parseStringsXml(readFileSync(join(resDir, "values/strings.xml"), "utf8"));
  const keys = usedKeys();
  return {
    "native.ja.json": pick(ja, keys),
    "native.en.json": pick(en, keys),
  };
}

function candidates() {
  const ja = parseStringsXml(readFileSync(join(resDir, "values-ja/strings.xml"), "utf8"));
  const byValue = new Map();
  for (const [k, v] of Object.entries(ja)) byValue.set(v, [...(byValue.get(v) ?? []), k]);
  const srcDir = join(webRoot, "src");
  for (const file of walk(srcDir)) {
    if (!/\.(ts|tsx)$/.test(file) || /\.test\.(ts|tsx)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/["'`>]\s*([^"'`<>{}\n]*[ぁ-んァ-ヶ一-龠][^"'`<>{}\n]*?)\s*["'`<]/g)) {
      const keys = byValue.get(m[1].trim());
      if (keys) console.log(`${relative(webRoot, file)}\t${m[1].trim()}\t${keys.join(",")}`);
    }
  }
}

function main() {
  const arg = process.argv[2];
  if (arg === "--candidates") return candidates();
  const files = build();
  if (arg === "--check") {
    const stale = Object.entries(files).filter(
      ([name, text]) => readFileSync(join(outDir, name), "utf8") !== text,
    );
    if (stale.length > 0) {
      console.error(
        `古い辞書: ${stale.map(([n]) => n).join(", ")}（node scripts/import-strings.mjs で更新）`,
      );
      process.exit(1);
    }
    return;
  }
  for (const [name, text] of Object.entries(files)) writeFileSync(join(outDir, name), text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
