import { useSyncExternalStore } from "react";

/** Expanded になる幅（ネイティブ COMPACT_BREAKPOINT_DP = 600。maxWidth < 600 が Compact） */
export const EXPANDED_QUERY = "(min-width: 600px)";

export type LayoutMode = "compact" | "expanded";

function hasMatchMedia(): boolean {
  return typeof window.matchMedia === "function";
}

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  const mql = window.matchMedia(EXPANDED_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): LayoutMode {
  if (!hasMatchMedia()) return "compact";
  return window.matchMedia(EXPANDED_QUERY).matches ? "expanded" : "compact";
}

/**
 * 幅による器の切替（Compact = タブ列 + ページャ + 下部ナビ / Expanded = レール + 横並びのデッキ）。
 * 判定はここ 1 か所だけ。CSS はメディアクエリを使わず、data-layout 属性で切り替える。
 * matchMedia が無い環境（jsdom 等）は常に compact。
 */
export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** OS の「視差効果を減らす」 */
export function prefersReducedMotion(): boolean {
  if (!hasMatchMedia()) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches === true;
}

/** 視差効果を減らす設定なら瞬時、それ以外は滑らかにスクロールする */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

/** 横スクロール。scrollTo が無い環境（jsdom）は scrollLeft へ直接入れる */
export function scrollToLeft(el: HTMLElement, left: number, behavior: ScrollBehavior): void {
  if (typeof el.scrollTo === "function") el.scrollTo({ left, behavior });
  else el.scrollLeft = left;
}
