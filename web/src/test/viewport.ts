import { act } from "@testing-library/react";

type ChangeListener = (e: MediaQueryListEvent) => void;

let width = 0;
const listeners = new Set<{ query: string; listener: ChangeListener; last: boolean }>();

/** `(min-width: Npx)` だけを評価する。それ以外のクエリは常に false */
function evaluate(query: string): boolean {
  const m = /^\(min-width:\s*(\d+)px\)$/.exec(query.trim());
  return m ? width >= Number(m[1]) : false;
}

/**
 * window.matchMedia を幅 width のスタブに差し替える（jsdom には matchMedia が無い）。
 * `change` リスナーは保持し、setViewportWidth で閾値をまたいだものだけ呼ぶ。
 */
export function mockViewport(w: number): void {
  width = w;
  listeners.clear();
  window.matchMedia = (query: string): MediaQueryList => {
    const mql = {
      media: query,
      get matches() {
        return evaluate(query);
      },
      onchange: null,
      addEventListener(type: string, listener: ChangeListener) {
        if (type === "change") listeners.add({ query, listener, last: evaluate(query) });
      },
      removeEventListener(type: string, listener: ChangeListener) {
        if (type !== "change") return;
        for (const entry of listeners) {
          if (entry.query === query && entry.listener === listener) listeners.delete(entry);
        }
      },
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    };
    return mql as unknown as MediaQueryList;
  };
}

/** 幅を変え、閾値をまたいだクエリの `change` リスナーを act の中で呼ぶ */
export function setViewportWidth(w: number): void {
  act(() => {
    width = w;
    for (const entry of [...listeners]) {
      const matches = evaluate(entry.query);
      if (matches === entry.last) continue;
      entry.last = matches;
      entry.listener({ matches, media: entry.query } as MediaQueryListEvent);
    }
  });
}

/** matchMedia を消す（jsdom の既定に戻す） */
export function clearViewport(): void {
  listeners.clear();
  // jsdom の window には matchMedia が無い。スタブを外して「無い」状態に戻す
  Reflect.deleteProperty(window, "matchMedia");
}

type Box = { clientWidth?: number; scrollWidth?: number; offsetLeft?: number; offsetWidth?: number };

/** jsdom はレイアウトを計算しない（寸法が常に 0）ので、要素に寸法を与える */
export function setBox(el: Element, box: Box): void {
  for (const [key, value] of Object.entries(box)) {
    Object.defineProperty(el, key, { configurable: true, get: () => value });
  }
}
