// 辞書化済みのファイル（許可リスト）に日本語リテラルが残っていないか確かめる。残っていれば非 0。
//   node scripts/check-i18n.mjs                 許可リストを検査する
//   node scripts/check-i18n.mjs <file>...       指定したファイルを検査する（テスト用）
// コメントは無視する。文字列リテラル・テンプレート・JSX テキストの日本語（ひらがな・カタカナ・漢字）を検出する。
// 限界: JSX テキスト中の ' や // は文字列・コメントの開始と見なす（辞書化後のファイルには日本語が無い前提）。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 辞書化済みのファイル（web/ からの相対）。辞書化が済むたびに足し、全体が済んだら全ファイル検査に切り替える */
export const MIGRATED = [
  "src/features/settings/DisplaySection.tsx",
  "src/app/navState.ts",
  "src/ui/AccountAvatar.tsx",
  "src/ui/BottomNav.tsx",
  "src/ui/CatEars.tsx",
  "src/ui/ColumnTabs.tsx",
  "src/ui/ConfirmDialog.tsx",
  "src/ui/ConnectionPill.tsx",
  "src/ui/DetailOverlay.tsx",
  "src/ui/EventJsonDialog.tsx",
  "src/ui/InfoDialog.tsx",
  "src/ui/MenuButton.tsx",
  "src/ui/ModalSheet.tsx",
  "src/ui/NavRail.tsx",
  "src/ui/PullToRefreshIndicator.tsx",
  "src/ui/QrCode.tsx",
  "src/ui/RelayIndicator.tsx",
  "src/ui/RelayStatusDialog.tsx",
  "src/ui/ScreenHeader.tsx",
  "src/ui/SingleColumnPane.tsx",
  "src/ui/Toaster.tsx",
  "src/ui/icons.tsx",
];

const JA = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

/** コメントを空白に置き換えたコードを返す（文字列・テンプレートの中の // や /* は消さない。改行は保つ） */
export function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
    } else if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else {
      if (c === '"' || c === "'" || c === "`") quote = c;
      out += c;
      i++;
    }
  }
  return out;
}

/** 日本語を含む行 [{ line, text }] */
export function findJapanese(src) {
  return stripComments(src)
    .split("\n")
    .flatMap((text, i) => (JA.test(text) ? [{ line: i + 1, text: text.trim() }] : []));
}

function main() {
  const args = process.argv.slice(2);
  const files = args.length > 0 ? args : MIGRATED.map((f) => join(webRoot, f));
  let bad = 0;
  for (const file of files) {
    for (const { line, text } of findJapanese(readFileSync(file, "utf8"))) {
      console.error(`${file}:${line}: 日本語リテラルが残っている: ${text}`);
      bad++;
    }
  }
  if (bad > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
