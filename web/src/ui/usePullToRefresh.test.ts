import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PULL_TO_REFRESH_THRESHOLD, usePullToRefresh } from "./usePullToRefresh";

afterEach(() => {
  vi.useRealTimers();
});

/** ref を渡した要素を用意する（scrollTop は既定 0） */
function attach(result: { current: ReturnType<typeof usePullToRefresh> }) {
  const el = document.createElement("div");
  document.body.append(el);
  act(() => result.current.ref(el));
  return el;
}

it("touchstart → touchmove（しきい値超え）→ touchend で onRefresh が 1 回呼ばれる", () => {
  const onRefresh = vi.fn();
  const { result } = renderHook(() => usePullToRefresh(onRefresh));
  const el = attach(result);

  fireEvent.touchStart(el, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(el, { touches: [{ clientY: PULL_TO_REFRESH_THRESHOLD + 10 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientY: PULL_TO_REFRESH_THRESHOLD + 10 }] });

  expect(onRefresh).toHaveBeenCalledTimes(1);
});

it("しきい値未満で離すと onRefresh は呼ばれない", () => {
  const onRefresh = vi.fn();
  const { result } = renderHook(() => usePullToRefresh(onRefresh));
  const el = attach(result);

  fireEvent.touchStart(el, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(el, { touches: [{ clientY: PULL_TO_REFRESH_THRESHOLD - 10 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientY: PULL_TO_REFRESH_THRESHOLD - 10 }] });

  expect(onRefresh).not.toHaveBeenCalled();
});

it("scrollTop > 0 では検知を始めない（引いても onRefresh は呼ばれない）", () => {
  const onRefresh = vi.fn();
  const { result } = renderHook(() => usePullToRefresh(onRefresh));
  const el = attach(result);
  Object.defineProperty(el, "scrollTop", { value: 10, configurable: true });

  fireEvent.touchStart(el, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(el, { touches: [{ clientY: PULL_TO_REFRESH_THRESHOLD + 10 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientY: PULL_TO_REFRESH_THRESHOLD + 10 }] });

  expect(onRefresh).not.toHaveBeenCalled();
});

it("上へは引かない（delta <= 0）と onRefresh は呼ばれない", () => {
  const onRefresh = vi.fn();
  const { result } = renderHook(() => usePullToRefresh(onRefresh));
  const el = attach(result);

  fireEvent.touchStart(el, { touches: [{ clientY: 100 }] });
  fireEvent.touchMove(el, { touches: [{ clientY: 0 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientY: 0 }] });

  expect(onRefresh).not.toHaveBeenCalled();
});

it("onRefresh を渡さなければリスナーを付けない（progress は動かない）", () => {
  const { result } = renderHook(() => usePullToRefresh(undefined));
  const el = attach(result);

  fireEvent.touchStart(el, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(el, { touches: [{ clientY: PULL_TO_REFRESH_THRESHOLD + 10 }] });

  expect(result.current.progress).toBe(0);
});

it("引いている間は progress が 0〜1 で増え、離すと 0 に戻る", () => {
  const { result } = renderHook(() => usePullToRefresh(vi.fn()));
  const el = attach(result);

  fireEvent.touchStart(el, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(el, { touches: [{ clientY: PULL_TO_REFRESH_THRESHOLD / 2 }] });
  expect(result.current.progress).toBeCloseTo(0.5);

  fireEvent.touchMove(el, { touches: [{ clientY: PULL_TO_REFRESH_THRESHOLD * 3 }] });
  expect(result.current.progress).toBe(1);

  fireEvent.touchEnd(el, { changedTouches: [{ clientY: PULL_TO_REFRESH_THRESHOLD * 3 }] });
  expect(result.current.progress).toBe(0);
});

it("しきい値を超えて離すと refreshing が立ち、一定時間で自動的に消える", () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => usePullToRefresh(vi.fn()));
  const el = attach(result);

  fireEvent.touchStart(el, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(el, { touches: [{ clientY: PULL_TO_REFRESH_THRESHOLD + 10 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientY: PULL_TO_REFRESH_THRESHOLD + 10 }] });
  expect(result.current.refreshing).toBe(true);

  act(() => vi.advanceTimersByTime(900));
  expect(result.current.refreshing).toBe(false);
});
