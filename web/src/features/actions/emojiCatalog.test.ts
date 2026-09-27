import { expect, it } from "vitest";
import { EMOJI_ALL, EMOJI_CATEGORIES, searchEmojis } from "./emojiCatalog";

it("カテゴリはネイティブと同じ順・件数（計 120、重複なし）", () => {
  expect(EMOJI_CATEGORIES.map((c) => c.title)).toEqual([
    "表情",
    "手・ジェスチャー",
    "ハート・感情",
    "動物・自然",
    "食べ物・飲み物",
    "アクティビティ・記号",
  ]);
  expect(EMOJI_CATEGORIES.map((c) => c.emojis.length)).toEqual([30, 14, 20, 20, 16, 20]);
  expect(EMOJI_ALL).toHaveLength(120);
});

it("キーワードの部分一致（大小無視）と絵文字そのものとの一致で探す", () => {
  expect(searchEmojis("わらい").map((e) => e.char)).toEqual(["😄", "😆", "🤣", "😂"]);
  expect(searchEmojis("FIRE").map((e) => e.char)).toContain("🔥");
  expect(searchEmojis(" 🔥 ").map((e) => e.char)).toContain("🔥");
  expect(searchEmojis("")).toEqual([]);
  expect(searchEmojis("   ")).toEqual([]);
});
