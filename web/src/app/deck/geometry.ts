/** 画面外のタブへ寄せるとき前に覗かせる幅（ネイティブ TAB_PEEK_PX） */
export const TAB_PEEK_PX = 48;

/** カラム間ガター 8px の半分。左端判定の遊び */
export const HALF_GUTTER_PX = 4;

/** Compact のページャ: スクロール位置 → 表示中のページ。幅 0（非表示・jsdom）かカラム 0 件なら null */
export function pageIndexFromScroll(scrollLeft: number, pageWidth: number, count: number): number | null {
  if (count === 0 || pageWidth <= 0) return null;
  return Math.min(Math.max(Math.round(scrollLeft / pageWidth), 0), count - 1);
}

/**
 * Expanded のデッキ: 左端に見えているカラム（offset ≤ scroll + 半ガター の最後）。
 * 横スクロールしない（全部見えている）ときは null（ネイティブ ExpandedDeck と同じ）。
 */
export function leftmostVisibleIndex(
  offsets: readonly number[],
  scrollLeft: number,
  scrollable: boolean,
): number | null {
  if (!scrollable || offsets.length === 0) return null;
  let index: number | null = null;
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] > scrollLeft + HALF_GUTTER_PX) break;
    index = i;
  }
  return index;
}

/**
 * タブ列の追従先。タブが完全に見えていれば動かさない（null）、見えていなければ前に TAB_PEEK_PX 覗かせて寄せる
 * （ネイティブ #324 / #334）。
 */
export function tabScrollTarget(
  tabLeft: number,
  tabWidth: number,
  viewLeft: number,
  viewWidth: number,
): number | null {
  if (tabLeft >= viewLeft && tabLeft + tabWidth <= viewLeft + viewWidth) return null;
  return Math.max(0, tabLeft - TAB_PEEK_PX);
}
