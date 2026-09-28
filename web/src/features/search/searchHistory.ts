import { create } from "zustand";

/** 検索履歴（文字列配列の JSON、新しい順）。ネイティブの KV search_history に当たる */
export const SEARCH_HISTORY_KEY = "nostrism.search.history";
export const SEARCH_HISTORY_MAX = 30;

/** 保存済みの検索履歴。無い・壊れている・配列でなければ空。文字列だけを trim して空と重複を除き、先頭 30 件 */
export function loadSearchHistory(): string[] {
  let value: unknown;
  try {
    value = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const terms = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v !== "");
  return [...new Set(terms)].slice(0, SEARCH_HISTORY_MAX);
}

/** null = 消す（クリア） */
function save(history: string[] | null) {
  try {
    if (history === null) localStorage.removeItem(SEARCH_HISTORY_KEY);
    else localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // 保存できない環境（容量超過・プライベートモード等）はメモリ上の状態だけで続ける
  }
}

export type SearchHistoryState = {
  /** 新しい順・重複なし・最大 30 件 */
  history: string[];
  /** 先頭に足す（同じ語は先頭へ移す）。空白だけなら何もしない */
  add(term: string): void;
  remove(term: string): void;
  clear(): void;
};

export const useSearchHistory = create<SearchHistoryState>()((set, get) => {
  const commit = (history: string[]) => {
    set({ history });
    save(history);
  };
  return {
    history: loadSearchHistory(),
    add(term) {
      const t = term.trim();
      if (t === "") return;
      commit([t, ...get().history.filter((x) => x !== t)].slice(0, SEARCH_HISTORY_MAX));
    },
    remove(term) {
      commit(get().history.filter((x) => x !== term));
    },
    clear() {
      set({ history: [] });
      save(null);
    },
  };
});
