import { renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { clearViewport, mockViewport, setViewportWidth } from "../test/viewport";
import { prefersReducedMotion, scrollBehavior, useLayoutMode } from "./useLayoutMode";

afterEach(() => {
  clearViewport();
});

it("599px は compact、600px は expanded（ネイティブの maxWidth < 600 と同じ境界）", () => {
  mockViewport(599);
  expect(renderHook(() => useLayoutMode()).result.current).toBe("compact");
  mockViewport(600);
  expect(renderHook(() => useLayoutMode()).result.current).toBe("expanded");
});

it("幅が 800 → 500 に変わると再描画で compact になる", () => {
  mockViewport(800);
  const { result } = renderHook(() => useLayoutMode());
  expect(result.current).toBe("expanded");

  setViewportWidth(500);
  expect(result.current).toBe("compact");
});

it("matchMedia が無ければ compact、視差効果の設定は false（滑らかにスクロール）", () => {
  clearViewport();
  expect(renderHook(() => useLayoutMode()).result.current).toBe("compact");
  expect(prefersReducedMotion()).toBe(false);
  expect(scrollBehavior()).toBe("smooth");
});
