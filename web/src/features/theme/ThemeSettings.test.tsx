import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ThemeSettings } from "./ThemeSettings";
import { DEFAULT_THEME_PREFS, initTheme, THEME_KEY, useThemePrefs } from "./themePrefs";

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
  localStorage.clear();
  useThemePrefs.setState(DEFAULT_THEME_PREFS);
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  root.removeAttribute("data-bold");
  root.style.removeProperty("--text-scale");
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.remove();
});

const html = () => document.documentElement;

it("現在の設定が選ばれた状態で出る（既定はダーク・小・太字オフ）", () => {
  render(<ThemeSettings />);
  expect(screen.getByRole("radio", { name: "ダーク" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "小" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "太い文字を使う" })).not.toBeChecked();
  expect(screen.getByRole("group", { name: "テーマ" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "文字サイズ" })).toBeInTheDocument();
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

  await user.click(screen.getByRole("checkbox", { name: "太い文字を使う" }));
  expect(html().hasAttribute("data-bold")).toBe(true);

  expect(JSON.parse(localStorage.getItem(THEME_KEY) ?? "null")).toEqual({
    mode: "light",
    textScale: "l",
    bold: true,
  });
});
