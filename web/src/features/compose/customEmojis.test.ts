import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { customEmojisFrom, emojiSetPointers } from "./customEmojis";

function event(kind: number, tags: string[][]): NostrEvent {
  return finalizeEvent({ kind, created_at: 1, tags, content: "" }, generateSecretKey());
}

it("10030 直下が 30030 のセットより先勝ち、http:// は捨て、shortcode 昇順", () => {
  const list = event(10030, [
    ["emoji", "cat", "https://a/cat.png"],
    ["emoji", "old", "http://a/old.png"],
    ["emoji", " ", "https://a/blank.png"],
  ]);
  const set = event(30030, [
    ["d", "s"],
    ["emoji", "cat", "https://b/cat.png"],
    ["emoji", "bird", "https://b/bird.png"],
  ]);
  expect(customEmojisFrom(list, [set, undefined])).toEqual([
    { shortcode: "bird", url: "https://b/bird.png" },
    { shortcode: "cat", url: "https://a/cat.png" },
  ]);
});

it("emojiSetPointers: 30030 の a タグだけ。d は : を含んでよい、pubkey が空なら捨てる", () => {
  const list = event(10030, [
    ["a", "30030:pk:d:x"],
    ["a", "30030::d"],
    ["a", "30023:pk:d"],
  ]);
  expect(emojiSetPointers(list)).toEqual([{ kind: 30030, pubkey: "pk", identifier: "d:x" }]);
  expect(emojiSetPointers(undefined)).toEqual([]);
});
