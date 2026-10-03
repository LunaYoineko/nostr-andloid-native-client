import { t } from "../../i18n";
import { buildSearchColumn, type ColumnSpec } from "../../lib/columns";

/**
 * 検索画面の条件（単語と #タグ）の操作（ネイティブ SearchScreen.kt の addToken / tokensToFilter の写し）。
 * 条件は OR で 1 つのフィードになる。
 */

/** 検索画面の結果の購読に使うカラム id（デッキには入れない） */
export const SEARCH_SCREEN_COLUMN_ID = "search_screen";
/** 検索結果（投稿）の表示上限（ネイティブ SEARCH_ROWS_TOTAL） */
export const SEARCH_ROWS_TOTAL = 300;

/** 入力を空白で分け、空でなく tokens に無い語だけを末尾に足した新しい配列 */
export function addTokens(tokens: readonly string[], raw: string): string[] {
  const next = [...tokens];
  for (const word of raw.split(/\s+/)) {
    const t = word.trim();
    if (t !== "" && !next.includes(t)) next.push(t);
  }
  return next;
}

/** 条件 → 単語（# で始まらない語）とタグ（# を 1 つ除いて小文字。空は捨てる） */
export function tokensToFilter(tokens: readonly string[]): { words: string[]; hashtags: string[] } {
  return {
    words: tokens.filter((t) => !t.startsWith("#")),
    hashtags: tokens
      .filter((t) => t.startsWith("#"))
      .map((t) => t.slice(1).toLowerCase())
      .filter((t) => t !== ""),
  };
}

/** ユーザー検索の語（# で始まらない条件を空白で連結） */
export function userQueryOf(tokens: readonly string[]): string {
  return tokens.filter((t) => !t.startsWith("#")).join(" ");
}

/** 検索結果の購読に使うカラム（一時。useColumnFeed に渡すだけ） */
export function searchSpecOf(tokens: readonly string[]): ColumnSpec {
  const { words, hashtags } = tokensToFilter(tokens);
  return { ...buildSearchColumn(words, hashtags, new Set(), 0), id: SEARCH_SCREEN_COLUMN_ID, pinned: false };
}

/** 結果の見出し「検索: <条件>」 */
export function searchSummary(tokens: readonly string[]): string {
  return t("search_summary_fmt", tokens.join(" "));
}
