import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { DEFAULT_CUSTOM_COLORS } from "./customPalette";
import { ThemeSettings } from "./ThemeSettings";
import { DEFAULT_THEME_PREFS, initTheme, THEME_KEY, useThemePrefs, useThemeUndo } from "./themePrefs";

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
  localStorage.clear();
  useThemePrefs.setState(DEFAULT_THEME_PREFS);
  useThemeUndo.setState(null);
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  root.removeAttribute("data-bold");
  root.removeAttribute("style");
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.remove();
});

const html = () => document.documentElement;

it("現在の設定が選ばれた状態で出る（既定はダーク・小・太字オフ・表示サイズ標準・種別表示なし）", () => {
  render(<ThemeSettings />);
  expect(screen.getByRole("radio", { name: "ダーク" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "小" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "標準" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "なし" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "太い文字を使う" })).not.toBeChecked();
  expect(screen.getByRole("group", { name: "テーマ" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "文字サイズ" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "表示サイズ" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "種別の視覚表示" })).toBeInTheDocument();
  // カスタムを選ぶまでは編集パネルを出さない
  expect(screen.queryByRole("button", { name: "Midnight" })).toBeNull();
});

it("選ぶとすぐ保存して <html> へ反映する", async () => {
  const user = userEvent.setup();
  dispose = initTheme();
  render(<ThemeSettings />);

  await user.click(screen.getByRole("radio", { name: "ライト" }));
  expect(screen.getByRole("radio", { name: "ライト" })).toBeChecked();
  expect(html().dataset.theme).toBe("light");

  await user.click(screen.getByRole("radio", { name: "大" }));
  expect(html().style.getPropertyValue("--text-scale")).toBe("1.35");

  await user.click(screen.getByRole("radio", { name: "最大" }));
  expect(html().style.getPropertyValue("--ui-scale")).toBe("1.3");

  await user.click(screen.getByRole("checkbox", { name: "太い文字を使う" }));
  expect(html().hasAttribute("data-bold")).toBe(true);

  await user.click(screen.getByRole("radio", { name: "縦ライン" }));

  expect(JSON.parse(localStorage.getItem(THEME_KEY) ?? "null")).toEqual({
    mode: "light",
    textScale: "l",
    bold: true,
    custom: DEFAULT_CUSTOM_COLORS,
    noteAccent: "line",
    uiScale: "l",
  });
});

it("テーマを「カスタム」にすると編集パネルが出る。プリセットを押すと即座に適用し、取り消しバーが出る", async () => {
  const user = userEvent.setup();
  dispose = initTheme();
  render(<ThemeSettings />);

  await user.click(screen.getByRole("radio", { name: "カスタム" }));
  expect(screen.getByRole("button", { name: "Midnight" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Sakura" }));

  expect(useThemePrefs.getState().custom).toEqual({ bg: "#FDF3F5", text: "#2A1E22", accent: "#C2557A" });
  expect(html().style.getPropertyValue("--bg")).toBe("#FDF3F5");
  expect(screen.getByText("「Sakura」を適用しました")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "元に戻す" }));
  // 取り消しは1手前（Sakura の直前 = カスタムに切り替えた直後の Midnight）へ戻す
  expect(useThemePrefs.getState().mode).toBe("custom");
  expect(useThemePrefs.getState().custom).toEqual(DEFAULT_CUSTOM_COLORS);
  expect(screen.queryByText("「Sakura」を適用しました")).toBeNull();
});

it("カスタムの hex 入力で色を変える。完全な値になるまでは反映しない", async () => {
  const user = userEvent.setup();
  dispose = initTheme();
  render(<ThemeSettings />);
  await user.click(screen.getByRole("radio", { name: "カスタム" }));

  const bgInput = screen.getByLabelText("背景");
  await user.clear(bgInput);
  await user.type(bgInput, "#00ff0");
  expect(useThemePrefs.getState().custom.bg).toBe(DEFAULT_CUSTOM_COLORS.bg);

  await user.type(bgInput, "0");
  expect(useThemePrefs.getState().custom.bg).toBe("#00FF00");
});

it("本文のコントラストが低いと警告を出す（適用はブロックしない）", async () => {
  const user = userEvent.setup();
  render(<ThemeSettings />);
  await user.click(screen.getByRole("radio", { name: "カスタム" }));

  const textInput = screen.getByLabelText("文字");
  await user.clear(textInput);
  await user.type(textInput, "#0D0D10"); // 背景 #0C0C10 に極めて近い文字色

  expect(screen.getByText(/コントラストが低いです/)).toBeInTheDocument();
  expect(useThemePrefs.getState().custom.text).toBe("#0D0D10");
});

it("「既定に戻す」でカスタム配色を Midnight へ戻す", async () => {
  const user = userEvent.setup();
  render(<ThemeSettings />);
  await user.click(screen.getByRole("radio", { name: "カスタム" }));
  await user.click(screen.getByRole("button", { name: "Sakura" }));

  await user.click(screen.getByRole("button", { name: "既定に戻す" }));

  expect(useThemePrefs.getState().custom).toEqual(DEFAULT_CUSTOM_COLORS);
});
