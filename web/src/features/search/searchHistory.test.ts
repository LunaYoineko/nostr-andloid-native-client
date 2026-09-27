import { beforeEach, expect, it } from "vitest";
import { loadSearchHistory, SEARCH_HISTORY_KEY, useSearchHistory } from "./searchHistory";

beforeEach(() => {
  localStorage.clear();
  useSearchHistory.setState({ history: [] });
});

function saved(): unknown {
  return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) ?? "null");
}

it("新しい順・重複なしで足し、保存する", () => {
  const { add } = useSearchHistory.getState();
  add("a");
  add("b");
  add("a");
  expect(useSearchHistory.getState().history).toEqual(["a", "b"]);
  expect(saved()).toEqual(["a", "b"]);
});

it("31 件足すと古いものから落として 30 件", () => {
  for (let i = 0; i < 31; i++) useSearchHistory.getState().add(`q${i}`);
  const { history } = useSearchHistory.getState();
  expect(history).toHaveLength(30);
  expect(history[0]).toBe("q30");
  expect(history.at(-1)).toBe("q1");
});

it("空白だけは足さず、前後の空白は落とす", () => {
  useSearchHistory.getState().add("   ");
  expect(useSearchHistory.getState().history).toEqual([]);
  useSearchHistory.getState().add("  rally #wrc ");
  expect(useSearchHistory.getState().history).toEqual(["rally #wrc"]);
});

it("remove は 1 件、clear は全部消す", () => {
  const s = useSearchHistory.getState();
  s.add("a");
  s.add("b");
  s.remove("a");
  expect(useSearchHistory.getState().history).toEqual(["b"]);
  expect(saved()).toEqual(["b"]);
  s.clear();
  expect(useSearchHistory.getState().history).toEqual([]);
  expect(localStorage.getItem(SEARCH_HISTORY_KEY)).toBeNull();
});

it("読み込み: 壊れた値・配列でない値は空、文字列だけを trim して重複と空を除く", () => {
  localStorage.setItem(SEARCH_HISTORY_KEY, "{broken");
  expect(loadSearchHistory()).toEqual([]);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify({ a: 1 }));
  expect(loadSearchHistory()).toEqual([]);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify([" a ", 1, "", "b", "a", null]));
  expect(loadSearchHistory()).toEqual(["a", "b"]);
  localStorage.removeItem(SEARCH_HISTORY_KEY);
  expect(loadSearchHistory()).toEqual([]);
});
