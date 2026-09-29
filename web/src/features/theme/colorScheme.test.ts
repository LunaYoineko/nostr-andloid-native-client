import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/**
 * [#644] Windows でスクロールバーがテーマに追従しない対策。
 * applyThemePrefs（./themePrefs.ts）が付ける <html data-theme> の値と CSS の color-scheme が
 * 1対1であることを確認する。getComputedStyle は jsdom で取れないため、CSS ソースの宣言を直接見る
 * （data-theme の付与自体は themePrefs.test.ts が確認する）。
 */
const tokensCss = readFileSync(join(process.cwd(), "..", "designs", "tokens.css"), "utf8");
const globalCss = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8");
const deckScreenCss = readFileSync(join(process.cwd(), "src/app/deck/DeckScreen.module.css"), "utf8");

it("data-theme=dark / light それぞれに対応する color-scheme が宣言されている", () => {
  expect(tokensCss).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark;/);
  expect(tokensCss).toMatch(/:root\[data-theme="light"\]\s*\{[^}]*color-scheme:\s*light;/);
});

it("html にテーマ追従のスクロールバー色を宣言している（継承で主要なスクロール領域へ効く）", () => {
  expect(globalCss).toMatch(
    /html\s*\{[^}]*scrollbar-width:\s*thin;[^}]*scrollbar-color:\s*var\(--surface-3\)\s*transparent;/,
  );
});

it("Compact のデッキ横スクロールだけは従来どおりスクロールバー非表示のまま", () => {
  expect(deckScreenCss).toMatch(/\[data-layout="compact"\]\s*\.strip\s*\{[^}]*scrollbar-width:\s*none;/);
});
