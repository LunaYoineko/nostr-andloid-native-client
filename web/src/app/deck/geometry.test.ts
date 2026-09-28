import { expect, it } from "vitest";
import { leftmostVisibleIndex, pageIndexFromScroll, tabScrollTarget } from "./geometry";

it("pageIndexFromScroll は最寄りのページに丸めて範囲に収める。幅 0・0 件は null", () => {
  expect(pageIndexFromScroll(800, 400, 3)).toBe(2);
  expect(pageIndexFromScroll(590, 400, 3)).toBe(1);
  expect(pageIndexFromScroll(5000, 400, 3)).toBe(2);
  expect(pageIndexFromScroll(0, 0, 3)).toBeNull();
  expect(pageIndexFromScroll(0, 400, 0)).toBeNull();
});

it("leftmostVisibleIndex は半ガター（4px）の遊びを持ち、横スクロールしなければ null", () => {
  const offsets = [0, 348, 696];
  expect(leftmostVisibleIndex(offsets, 350, true)).toBe(1);
  expect(leftmostVisibleIndex(offsets, 344, true)).toBe(1);
  expect(leftmostVisibleIndex(offsets, 343, true)).toBe(0);
  expect(leftmostVisibleIndex(offsets, 350, false)).toBeNull();
  expect(leftmostVisibleIndex([], 0, true)).toBeNull();
});

it("tabScrollTarget は完全に見えていれば null、見えていなければ 48px 覗かせる", () => {
  expect(tabScrollTarget(100, 80, 0, 300)).toBeNull();
  expect(tabScrollTarget(280, 80, 0, 300)).toBe(232);
  expect(tabScrollTarget(20, 80, 50, 300)).toBe(0);
});
