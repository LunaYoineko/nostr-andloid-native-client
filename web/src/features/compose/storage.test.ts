import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { afterEach, expect, it, vi } from "vitest";
import { discardUnsent } from "../../nostr/publish";
import {
  DRAFT_KEY,
  loadDraft,
  loadUsedHashtags,
  pinnedHashtagsFrom,
  recentHashtagChips,
  recordHashtags,
  saveDraft,
  tagSuggestions,
  USED_HASHTAGS_KEY,
  unsentToDraft,
} from "./storage";

vi.mock("../../nostr/publish", () => ({ discardUnsent: vi.fn() }));

afterEach(() => {
  localStorage.clear();
});

it("下書き: 空白だけならキーを消す", () => {
  saveDraft("abc");
  expect(loadDraft()).toBe("abc");
  saveDraft("  ");
  expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
});

it("使用履歴: 新しい順、500 件まで、壊れていれば空", () => {
  recordHashtags("#a #b", 1);
  recordHashtags("#a", 2);
  expect(loadUsedHashtags()).toEqual(["a", "b"]);

  recordHashtags(Array.from({ length: 501 }, (_, i) => `#t${i}`).join(" "), 3);
  expect(loadUsedHashtags()).toHaveLength(500);

  localStorage.setItem(USED_HASHTAGS_KEY, "{broken");
  expect(loadUsedHashtags()).toEqual([]);
});

it("最近のタグはピン留めを除いて 8 件、候補は前方一致（断片そのものは除く）8 件", () => {
  const used = ["a1", "zap", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9"];
  expect(recentHashtagChips(used, ["zap"])).toEqual(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
  expect(tagSuggestions("a", ["ab", "a"], used)).toEqual(["ab", "a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
  expect(tagSuggestions("zap", ["zap"], used)).toEqual([]);
});

it("pinnedHashtagsFrom: d=pinned の t を正規化して 15 件まで", () => {
  const key = generateSecretKey();
  const set = (d: string, tags: string[]) =>
    finalizeEvent(
      { kind: 30015, created_at: 1, tags: [["d", d], ...tags.map((t) => ["t", t])], content: "" },
      key,
    );
  expect(pinnedHashtagsFrom(set("other", ["zap"]))).toEqual([]);
  expect(pinnedHashtagsFrom(set("pinned", [" #Zap ", "zap", "a b", "日本"]))).toEqual(["zap", "日本"]);
  expect(
    pinnedHashtagsFrom(
      set(
        "pinned",
        Array.from({ length: 16 }, (_, i) => `t${i}`),
      ),
    ),
  ).toHaveLength(15);
  expect(pinnedHashtagsFrom(undefined)).toEqual([]);
});

it("unsentToDraft: 既存の下書きの後ろに未送信の本文を足す", () => {
  const unsent = finalizeEvent({ kind: 1, created_at: 1, tags: [], content: "b" }, generateSecretKey());
  vi.mocked(discardUnsent).mockReturnValueOnce(unsent);
  saveDraft("a");
  expect(unsentToDraft(unsent.id)).toBe(true);
  expect(loadDraft()).toBe("a\n\nb");

  vi.mocked(discardUnsent).mockReturnValueOnce(null);
  expect(unsentToDraft("missing")).toBe(false);
});
