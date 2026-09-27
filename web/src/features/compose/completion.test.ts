import { expect, it } from "vitest";
import {
  activeEmoji,
  activeMention,
  activeTagPrefix,
  appendHashtag,
  completeHashtag,
  completeMention,
  insertAtCursor,
  insertEmojiShortcode,
} from "./completion";

it("activeTagPrefix: # 以降が文字・数字・_ だけなら小文字で（空も可）", () => {
  expect(activeTagPrefix("abc #No")).toBe("no");
  expect(activeTagPrefix("abc #")).toBe("");
  expect(activeTagPrefix("abc #no pe")).toBeNull();
  expect(activeTagPrefix("abc")).toBeNull();
});

it("activeMention: 直前が空白か先頭で、以降が 1 文字以上", () => {
  expect(activeMention("hi @al")).toBe("al");
  expect(activeMention("hi@al")).toBeNull();
  expect(activeMention("hi @")).toBeNull();
  expect(activeMention("@a.b_c")).toBe("a.b_c");
});

it("activeEmoji: 直前が空白か先頭（URL の : は拾わない）", () => {
  expect(activeEmoji("hi :ca")).toBe("ca");
  expect(activeEmoji("http://x")).toBeNull();
  expect(activeEmoji(":+1")).toBe("+1");
});

it("置換・挿入はカーソルを挿入した文字列の末尾へ", () => {
  expect(completeMention({ text: "hi @al", cursor: 6 }, "npub1x")).toEqual({
    text: "hi nostr:npub1x ",
    cursor: 16,
  });
  expect(completeHashtag({ text: "a #bi c", cursor: 5 }, "bitcoin")).toEqual({
    text: "a #bitcoin  c",
    cursor: 11,
  });
  expect(insertEmojiShortcode({ text: "hi :ca", cursor: 6 }, "cat")).toEqual({
    text: "hi :cat: ",
    cursor: 9,
  });
  expect(insertAtCursor({ text: "ac", cursor: 1 }, "b")).toEqual({ text: "abc", cursor: 2 });
});

it("appendHashtag: 直前が空白でなければ空白を挟み、既にあれば何もしない", () => {
  expect(appendHashtag({ text: "abc", cursor: 3 }, "nostr")).toEqual({ text: "abc #nostr ", cursor: 11 });
  expect(appendHashtag({ text: "", cursor: 0 }, "nostr")).toEqual({ text: "#nostr ", cursor: 7 });
  const has = { text: "x #nostr y", cursor: 10 };
  expect(appendHashtag(has, "nostr")).toBe(has);
});
