/**
 * カスタムテーマ（#464 の残り）: 背景・文字・アクセントの3色から残りのトークンを導出する。
 * ネイティブ composeApp/src/commonMain/kotlin/app/nostrdeck/theme/Color.kt の customPalette（165–197行）
 * と同じ式・同じ値。片方を変えたらもう片方も合わせること。
 */

/** 3色（"#RRGGBB"）。既定はネイティブ CustomThemePrefs.DEFAULT / Midnight プリセットと同じ */
export type CustomColors = { bg: string; text: string; accent: string };

export const DEFAULT_CUSTOM_COLORS: CustomColors = { bg: "#0C0C10", text: "#ECEDF1", accent: "#FFFFFF" };

/** customPalette が返す導出済みトークン（すべて "#RRGGBB" 、accentWeak と kind*Bg だけ rgba()） */
export type CustomPalette = {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accent2: string;
  accentWeak: string;
  zap: string;
  repost: string;
  like: string;
  verified: string;
  warn: string;
  kindRepost: string;
  kindQuote: string;
  kindReply: string;
  kindReaction: string;
};

/** ダーク土台（Color.kt DarkPalette のうち、customPalette が上書きしないフィールドのみ） */
const DARK_BASIS = {
  verified: "#4FA77A",
  warn: "#C76B6B",
  kindRepost: "#2E7D52",
  kindQuote: "#3A6EA5",
  kindReply: "#9A7B2E",
  kindReaction: "#A34A5E",
};

/** ライト土台（Color.kt LightPalette のうち、customPalette が上書きしないフィールドのみ） */
const LIGHT_BASIS = {
  verified: "#2F7D55",
  warn: "#B04A4A",
  kindRepost: "#1F6B44",
  kindQuote: "#2C5C90",
  kindReply: "#7D6220",
  kindReaction: "#8E3A4E",
};

/** "#RRGGBB" / "RRGGBB" / "#AARRGGBB" を [r,g,b] へ（アルファは捨てて不透明にする）。不正なら null */
export function parseRgb(input: string): [number, number, number] | null {
  const h = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h) && !/^[0-9a-fA-F]{8}$/.test(h)) return null;
  const rgb = h.length === 8 ? h.slice(2) : h;
  return [
    Number.parseInt(rgb.slice(0, 2), 16),
    Number.parseInt(rgb.slice(2, 4), 16),
    Number.parseInt(rgb.slice(4, 6), 16),
  ];
}

function toHexColor([r, g, b]: readonly [number, number, number]): string {
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0").toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** 入力を "#RRGGBB"（大文字）へ正規化する。不正なら null（ネイティブ CustomThemePrefs.parseHex + toHex と同じ入出力） */
export function normalizeHex(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const rgb = parseRgb(input);
  return rgb ? toHexColor(rgb) : null;
}

function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseRgb(a) ?? [0, 0, 0];
  const [br, bg, bb] = parseRgb(b) ?? [0, 0, 0];
  return toHexColor([
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t),
  ]);
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 相対輝度（WCAG）。0=黒 1=白 */
export function luminance(hex: string): number {
  const [r, g, b] = parseRgb(hex) ?? [0, 0, 0];
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** コントラスト比（1〜21）。本文可読性は 4.5 以上が目安（WCAG AA） */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** "#RRGGBB" を rgba(r, g, b, alpha) へ */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseRgb(hex) ?? [0, 0, 0];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 3色から全トークンを導出する（Color.kt customPalette と同じ式）。
 * 背景の輝度 < 0.5 ならダーク土台、以上ならライト土台にする。
 * surface 系は背景から段階的に明度をずらし（ダークは白、ライトは黒を混ぜる）、
 * text2/text3 は文字色を背景へ寄せて作る。種別色（kind*）と警告色は土台のまま。
 */
export function customPalette(colors: CustomColors): CustomPalette {
  const { bg, text, accent } = colors;
  const dark = luminance(bg) < 0.5;
  const basis = dark ? DARK_BASIS : LIGHT_BASIS;
  const mixTo = dark ? "#FFFFFF" : "#000000";
  const step = (f: number) => lerpHex(bg, mixTo, f);
  const textStep = (f: number) => lerpHex(text, bg, f);

  return {
    bg,
    surface: step(0.04),
    surface2: step(0.08),
    surface3: step(0.13),
    border: step(0.16),
    borderStrong: step(0.24),
    text,
    text2: textStep(0.28),
    text3: textStep(0.48),
    accent,
    accent2: lerpHex(accent, bg, 0.25),
    accentWeak: withAlpha(accent, 0.14),
    zap: textStep(0.05),
    repost: textStep(0.18),
    like: textStep(0.38),
    verified: basis.verified,
    warn: basis.warn,
    kindRepost: basis.kindRepost,
    kindQuote: basis.kindQuote,
    kindReply: basis.kindReply,
    kindReaction: basis.kindReaction,
  };
}

/** customPalette の結果を <html> へ当てる CSS 変数名 → 値のマップ（designs/tokens.css の色系変数と1対1） */
export function customPaletteVars(colors: CustomColors): Record<string, string> {
  const p = customPalette(colors);
  return {
    "--bg": p.bg,
    "--surface": p.surface,
    "--surface-2": p.surface2,
    "--surface-3": p.surface3,
    "--border": p.border,
    "--border-strong": p.borderStrong,
    "--text": p.text,
    "--text-2": p.text2,
    "--text-3": p.text3,
    "--accent": p.accent,
    "--accent-2": p.accent2,
    "--accent-weak": p.accentWeak,
    "--zap": p.zap,
    "--repost": p.repost,
    "--like": p.like,
    "--verified": p.verified,
    "--warn": p.warn,
    "--kind-repost": p.kindRepost,
    "--kind-quote": p.kindQuote,
    "--kind-reply": p.kindReply,
    "--kind-reaction": p.kindReaction,
    "--kind-repost-bg": withAlpha(p.kindRepost, 0.14),
    "--kind-quote-bg": withAlpha(p.kindQuote, 0.14),
    "--kind-reply-bg": withAlpha(p.kindReply, 0.14),
    "--kind-reaction-bg": withAlpha(p.kindReaction, 0.14),
  };
}

/** 名前付きプリセット（ネイティブ CustomThemePrefs.PRESETS と同じ名前・色。ストア共有〈#539〉は別） */
export const CUSTOM_PRESETS: readonly { name: string; colors: CustomColors }[] = [
  { name: "Midnight", colors: { bg: "#0C0C10", text: "#ECEDF1", accent: "#FFFFFF" } },
  { name: "Paper", colors: { bg: "#F7F6F2", text: "#1A1A1E", accent: "#1A1A1E" } },
  { name: "Solar", colors: { bg: "#002B36", text: "#93A1A1", accent: "#B58900" } },
  { name: "Forest", colors: { bg: "#0E1A14", text: "#E2EDE6", accent: "#4FA77A" } },
  { name: "Sakura", colors: { bg: "#FDF3F5", text: "#2A1E22", accent: "#C2557A" } },
];
