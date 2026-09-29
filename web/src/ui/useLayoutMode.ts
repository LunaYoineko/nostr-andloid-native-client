import { useSyncExternalStore } from "react";
import { UI_SCALE_FACTOR, useThemePrefs } from "../features/theme/themePrefs";

export type LayoutMode = "compact" | "expanded";

function hasMatchMedia(): boolean {
  return typeof window.matchMedia === "function";
}

/** 現在の表示サイズの倍率（ネイティブ density * uiScale.factor と同じ値） */
function currentUiScale(): number {
  return UI_SCALE_FACTOR[useThemePrefs.getState().uiScale];
}

/** [#596] ネイティブは dp の閾値に density * uiScale を掛けて px 判定するのと同じ結果になるよう、閾値(dp)側に uiScale を掛ける */
function queryFor(breakpointDp: number, uiScale: number): string {
  return `(min-width: ${Math.round(breakpointDp * uiScale)}px)`;
}

/**
 * [#596] 幅の変化（matchMedia の change）と表示サイズの変化（uiScale）の両方で再評価する。
 * uiScale が変わったら閾値の px が変わるため、古い matchMedia を解除して新しい閾値で張り直す。
 */
function subscribeAtBreakpoint(breakpointDp: number, onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  let uiScale = currentUiScale();
  let mql = window.matchMedia(queryFor(breakpointDp, uiScale));
  mql.addEventListener("change", onChange);
  const unsubscribeTheme = useThemePrefs.subscribe((prefs) => {
    const nextUiScale = UI_SCALE_FACTOR[prefs.uiScale];
    if (nextUiScale === uiScale) return;
    mql.removeEventListener("change", onChange);
    uiScale = nextUiScale;
    if (!hasMatchMedia()) return;
    mql = window.matchMedia(queryFor(breakpointDp, uiScale));
    mql.addEventListener("change", onChange);
    onChange();
  });
  return () => {
    mql.removeEventListener("change", onChange);
    unsubscribeTheme();
  };
}

function getMatchesAtBreakpoint(breakpointDp: number): boolean {
  if (!hasMatchMedia()) return false;
  return window.matchMedia(queryFor(breakpointDp, currentUiScale())).matches;
}

/** Expanded になる閾値（ネイティブ COMPACT_BREAKPOINT_DP = 600。maxWidth < 600 が Compact） */
const COMPACT_BREAKPOINT_DP = 600;

function subscribe(onChange: () => void): () => void {
  return subscribeAtBreakpoint(COMPACT_BREAKPOINT_DP, onChange);
}

function getSnapshot(): LayoutMode {
  return getMatchesAtBreakpoint(COMPACT_BREAKPOINT_DP) ? "expanded" : "compact";
}

/**
 * 幅による器の切替（Compact = タブ列 + ページャ + 下部ナビ / Expanded = レール + 横並びのデッキ）。
 * 判定はここ 1 か所だけ。CSS はメディアクエリを使わず、data-layout 属性で切り替える。
 * matchMedia が無い環境（jsdom 等）は常に compact。
 */
export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * [#332][#540] Compact のまま左レールに切り替える最小幅（ネイティブ RAIL_COMPACT_MIN_WIDTH_DP と同じ 440）。
 * 幅の広いスマホ表示（Fold のカバー画面等）向け。下部ナビの 72dp が高くつくので、
 * ナビだけデッキと同じ左レールにする（内容は 600px 未満なので [useLayoutMode] は compact のまま）。
 */
const RAIL_MIN_WIDTH_DP = 440;

/** [#648] ホバーできる端末（PC のブラウザを細くした場合）だけレールを出す。タッチ端末は常に下部ナビ */
const HOVER_FINE_QUERY = "(hover: hover) and (pointer: fine)";

function subscribeHoverCapable(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  const mql = window.matchMedia(HOVER_FINE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function isHoverCapable(): boolean {
  if (!hasMatchMedia()) return false;
  return window.matchMedia(HOVER_FINE_QUERY).matches;
}

function subscribeRail(onChange: () => void): () => void {
  const unsubscribeWidth = subscribeAtBreakpoint(RAIL_MIN_WIDTH_DP, onChange);
  const unsubscribeHover = subscribeHoverCapable(onChange);
  return () => {
    unsubscribeWidth();
    unsubscribeHover();
  };
}

function getRailSnapshot(): boolean {
  return getMatchesAtBreakpoint(RAIL_MIN_WIDTH_DP) && isHoverCapable();
}

/**
 * 左レールを出すか（440px 以上 かつ ホバーできる端末だけ）。
 * [#648] タッチ端末（hover 無し）は 600px 未満では常に下部ナビ。600px 以上（Expanded）は
 * 呼び出し側（[useLayoutMode] が "expanded"）がこの値を無視して常にレールにする。
 * matchMedia が無ければ false
 */
export function useShowNavRail(): boolean {
  return useSyncExternalStore(subscribeRail, getRailSnapshot);
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
