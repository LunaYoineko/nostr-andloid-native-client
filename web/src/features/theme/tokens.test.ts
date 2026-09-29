import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/**
 * designs/tokens.css の色トークンが、ネイティブ composeApp Color.kt の DarkPalette / LightPalette
 * （bg/surface/border/text/accent/zap/repost/like/boost/verified/warn/kind*）と値で一致することを
 * 確認する（#646）。CSS を直接読んで --トークン名: 値; を突き合わせる。
 */
const CSS_PATH = join(process.cwd(), "..", "designs", "tokens.css");
const css = readFileSync(CSS_PATH, "utf8");

function extractBlock(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const braceStart = css.indexOf("{", start);
  const braceEnd = css.indexOf("}", braceStart);
  return css.slice(braceStart + 1, braceEnd);
}

function readVar(block: string, name: string): string {
  const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`var not found: --${name}`);
  return m[1].trim();
}

// :root[data-theme="light"] より後に書かれた素の :root がダーク（既定）の配色ブロック
const darkBlock = extractBlock(":root {");
const lightBlock = extractBlock(':root[data-theme="light"] {');

/** Color.kt DarkPalette と1対1（ARGB から RGB を写した値） */
const NATIVE_DARK: Record<string, string> = {
  bg: "#0c0c10",
  surface: "#15151c",
  "surface-2": "#1d1d26",
  "surface-3": "#262631",
  border: "#2c2c38",
  "border-strong": "#3a3a48",
  text: "#ecedf1",
  "text-2": "#bebfc9",
  "text-3": "#90919e",
  accent: "#f2f2f5",
  "accent-2": "#c9c9d0",
  "accent-weak": "rgb(255 255 255 / 8%)",
  zap: "#e7e7ea",
  repost: "#c9c9d0",
  like: "#8a8a93",
  boost: "#4fa77a",
  verified: "#4fa77a",
  warn: "#c76b6b",
  "kind-repost": "#2e7d52",
  "kind-quote": "#3a6ea5",
  "kind-reply": "#9a7b2e",
  "kind-reaction": "#a34a5e",
};

/** Color.kt LightPalette と1対1 */
const NATIVE_LIGHT: Record<string, string> = {
  bg: "#f2f2f5",
  surface: "#fbfbfd",
  "surface-2": "#eaeaef",
  "surface-3": "#dfdfe6",
  border: "#d4d4dc",
  "border-strong": "#bfbfca",
  text: "#16171c",
  "text-2": "#45464f",
  "text-3": "#6b6c78",
  accent: "#16171c",
  "accent-2": "#3b3c45",
  "accent-weak": "rgb(0 0 0 / 8%)",
  zap: "#2e2f36",
  repost: "#3b3c45",
  like: "#7a7b85",
  boost: "#2f7d55",
  verified: "#2f7d55",
  warn: "#b04a4a",
  "kind-repost": "#1f6b44",
  "kind-quote": "#2c5c90",
  "kind-reply": "#7d6220",
  "kind-reaction": "#8e3a4e",
};

it("designs/tokens.css のダーク配色は Color.kt DarkPalette と一致する", () => {
  for (const [name, expected] of Object.entries(NATIVE_DARK)) {
    expect(readVar(darkBlock, name), `--${name}`).toBe(expected);
  }
});

it("designs/tokens.css のライト配色は Color.kt LightPalette と一致する", () => {
  for (const [name, expected] of Object.entries(NATIVE_LIGHT)) {
    expect(readVar(lightBlock, name), `--${name}`).toBe(expected);
  }
});
