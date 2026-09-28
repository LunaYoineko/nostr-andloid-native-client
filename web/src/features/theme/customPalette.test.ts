import { expect, it } from "vitest";
import {
  CUSTOM_PRESETS,
  type CustomColors,
  contrastRatio,
  customPalette,
  customPaletteVars,
  DEFAULT_CUSTOM_COLORS,
  luminance,
  normalizeHex,
  withAlpha,
} from "./customPalette";

const MIDNIGHT: CustomColors = { bg: "#0C0C10", text: "#ECEDF1", accent: "#FFFFFF" };
const PAPER: CustomColors = { bg: "#F7F6F2", text: "#1A1A1E", accent: "#1A1A1E" };

it("既定は Midnight プリセットと同じ", () => {
  expect(DEFAULT_CUSTOM_COLORS).toEqual(MIDNIGHT);
});

it("輝度の境目: Midnight はダーク土台、Paper はライト土台（背景の相対輝度 0.5 が境目）", () => {
  expect(luminance(MIDNIGHT.bg)).toBeLessThan(0.5);
  expect(luminance(PAPER.bg)).toBeGreaterThanOrEqual(0.5);
});

it("customPalette(Midnight): ダーク土台からの導出値（固定ベクタ）", () => {
  expect(customPalette(MIDNIGHT)).toEqual({
    bg: "#0C0C10",
    surface: "#16161A",
    surface2: "#1F1F23",
    surface3: "#2C2C2F",
    border: "#333336",
    borderStrong: "#464649",
    text: "#ECEDF1",
    text2: "#ADAEB2",
    text3: "#808185",
    accent: "#FFFFFF",
    accent2: "#C2C2C3",
    accentWeak: "rgba(255, 255, 255, 0.14)",
    zap: "#E1E2E6",
    repost: "#C4C5C9",
    like: "#97989C",
    verified: "#4FA77A",
    warn: "#C76B6B",
    kindRepost: "#2E7D52",
    kindQuote: "#3A6EA5",
    kindReply: "#9A7B2E",
    kindReaction: "#A34A5E",
  });
});

it("customPalette(Paper): ライト土台からの導出値（固定ベクタ）", () => {
  expect(customPalette(PAPER)).toEqual({
    bg: "#F7F6F2",
    surface: "#EDECE8",
    surface2: "#E3E2DF",
    surface3: "#D7D6D3",
    border: "#CFCFCB",
    borderStrong: "#BCBBB8",
    text: "#1A1A1E",
    text2: "#585859",
    text3: "#848484",
    accent: "#1A1A1E",
    accent2: "#515153",
    accentWeak: "rgba(26, 26, 30, 0.14)",
    zap: "#252529",
    repost: "#424244",
    like: "#6E6E6F",
    verified: "#2F7D55",
    warn: "#B04A4A",
    kindRepost: "#1F6B44",
    kindQuote: "#2C5C90",
    kindReply: "#7D6220",
    kindReaction: "#8E3A4E",
  });
});

it("コントラスト比: 白黒は21、同色は1", () => {
  expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
  expect(contrastRatio("#123456", "#123456")).toBe(1);
});

it("コントラスト比: Midnight/Paper は本文・アクセントとも読みやすい配色", () => {
  expect(contrastRatio(MIDNIGHT.bg, MIDNIGHT.text)).toBeCloseTo(16.687, 3);
  expect(contrastRatio(MIDNIGHT.bg, MIDNIGHT.accent)).toBeCloseTo(19.522, 3);
  expect(contrastRatio(PAPER.bg, PAPER.text)).toBeCloseTo(16.043, 3);
});

it("normalizeHex: #RRGGBB / RRGGBB / #AARRGGBB を受け、アルファは捨てて大文字の#RRGGBBへ", () => {
  expect(normalizeHex("#0c0c10")).toBe("#0C0C10");
  expect(normalizeHex("0C0C10")).toBe("#0C0C10");
  expect(normalizeHex("#FF0C0C10")).toBe("#0C0C10");
});

it("normalizeHex: 不正な値は null", () => {
  expect(normalizeHex("")).toBeNull();
  expect(normalizeHex("#12345")).toBeNull();
  expect(normalizeHex("not-a-color")).toBeNull();
  expect(normalizeHex(null)).toBeNull();
  expect(normalizeHex(undefined)).toBeNull();
});

it("withAlpha: rgba() 文字列にする", () => {
  expect(withAlpha("#A855F7", 0.14)).toBe("rgba(168, 85, 247, 0.14)");
});

it("プリセットはネイティブ CustomThemePrefs.PRESETS と同じ 5 件", () => {
  expect(CUSTOM_PRESETS.map((p) => p.name)).toEqual(["Midnight", "Paper", "Solar", "Forest", "Sakura"]);
  const sakura = CUSTOM_PRESETS.find((p) => p.name === "Sakura");
  expect(sakura?.colors).toEqual({ bg: "#FDF3F5", text: "#2A1E22", accent: "#C2557A" });
});

it("customPaletteVars: CSS変数名のマップにする（-bg は kind* の alpha 0.14）", () => {
  const vars = customPaletteVars(MIDNIGHT);
  const p = customPalette(MIDNIGHT);
  expect(vars["--bg"]).toBe(p.bg);
  expect(vars["--accent-weak"]).toBe(p.accentWeak);
  expect(vars["--kind-repost"]).toBe(p.kindRepost);
  expect(vars["--kind-repost-bg"]).toBe(withAlpha(p.kindRepost, 0.14));
  expect(vars["--kind-quote-bg"]).toBe(withAlpha(p.kindQuote, 0.14));
  expect(vars["--kind-reply-bg"]).toBe(withAlpha(p.kindReply, 0.14));
  expect(vars["--kind-reaction-bg"]).toBe(withAlpha(p.kindReaction, 0.14));
});
