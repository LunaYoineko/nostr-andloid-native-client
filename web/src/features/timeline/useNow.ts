import { useSyncExternalStore } from "react";
import { unixNow } from "../../lib/time";

type Clock = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
};

/**
 * intervalMs ごとに現在時刻（UNIX 秒）を配る時計。購読者がいる間だけ setInterval を 1 本回し、
 * タブが隠れている間は止める。表示に戻ったら即 1 回更新して再開する。
 */
function createClock(intervalMs: number): Clock {
  const listeners = new Set<() => void>();
  let now = unixNow();
  let timer: ReturnType<typeof setInterval> | undefined;

  function tick() {
    const next = unixNow();
    if (next === now) return;
    now = next;
    for (const listener of listeners) listener();
  }

  function start() {
    if (timer !== undefined || document.visibilityState === "hidden") return;
    timer = setInterval(tick, intervalMs);
  }

  function stop() {
    if (timer === undefined) return;
    clearInterval(timer);
    timer = undefined;
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") {
      stop();
    } else {
      tick();
      start();
    }
  }

  return {
    subscribe(listener) {
      if (listeners.size === 0) {
        tick();
        start();
        document.addEventListener("visibilitychange", onVisibilityChange);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        stop();
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    },
    // 誰も購読していない間は時計が止まっているので、読むたびに今の時刻に合わせる
    getSnapshot() {
      if (listeners.size === 0) now = unixNow();
      return now;
    },
  };
}

// 間隔ごとに 1 つの時計をモジュールで共有する（購読者が何人いても setInterval は 1 本）
const clocks = new Map<number, Clock>();

/** 現在時刻（UNIX 秒）。intervalMs ごとに更新して再描画する（相対時刻の表示用） */
export function useNow(intervalMs = 30_000): number {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = createClock(intervalMs);
    clocks.set(intervalMs, clock);
  }
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot);
}
