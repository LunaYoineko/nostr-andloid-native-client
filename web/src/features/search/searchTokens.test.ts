import { expect, it } from "vitest";
import { addTokens, searchSpecOf, searchSummary, tokensToFilter, userQueryOf } from "./searchTokens";

it("addTokens: 空白で分け、まだ無い語だけを末尾に足す", () => {
  const tokens = ["rally"];
  expect(addTokens(tokens, "  #wrc rally  #rally ")).toEqual(["rally", "#wrc", "#rally"]);
  expect(tokens).toEqual(["rally"]);
  expect(addTokens([], "   ")).toEqual([]);
});

it("tokensToFilter: # 始まりはタグ（# を除いて小文字）、# だけの語は捨てる", () => {
  expect(tokensToFilter(["rally", "#WRC", "#"])).toEqual({ words: ["rally"], hashtags: ["wrc"] });
});

it("userQueryOf: # で始まらない語を空白で連結", () => {
  expect(userQueryOf(["foo", "#t", "bar"])).toBe("foo bar");
  expect(userQueryOf(["#t"])).toBe("");
});

it("searchSpecOf: 検索画面用の一時カラム（GLOBAL・単語とタグ）", () => {
  const spec = searchSpecOf(["rally", "#wrc"]);
  expect(spec.id).toBe("search_screen");
  expect(spec.kind).toBe("GLOBAL");
  expect(spec.filter.words).toEqual(["rally"]);
  expect(spec.filter.hashtags).toEqual(["wrc"]);
  expect(spec.pinned).toBe(false);
});

it("searchSummary", () => {
  expect(searchSummary(["rally", "#wrc"])).toBe("検索: rally #wrc");
});
