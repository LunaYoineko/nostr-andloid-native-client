import { expect, it } from "vitest";
import { type NoteAccentInput, noteAccentKindOf } from "./noteAccent";

const NONE: NoteAccentInput = { isRepost: false, hasQuote: false, isReaction: false, isReply: false };

it("該当なしは null", () => {
  expect(noteAccentKindOf(NONE)).toBeNull();
});

it("単独の該当はそのまま", () => {
  expect(noteAccentKindOf({ ...NONE, isRepost: true })).toBe("repost");
  expect(noteAccentKindOf({ ...NONE, hasQuote: true })).toBe("quote");
  expect(noteAccentKindOf({ ...NONE, isReaction: true })).toBe("reaction");
  expect(noteAccentKindOf({ ...NONE, isReply: true })).toBe("reply");
});

it("優先順: リポスト > 引用 > リアクション > 返信", () => {
  expect(noteAccentKindOf({ isRepost: true, hasQuote: true, isReaction: true, isReply: true })).toBe(
    "repost",
  );
  expect(noteAccentKindOf({ isRepost: false, hasQuote: true, isReaction: true, isReply: true })).toBe(
    "quote",
  );
  expect(noteAccentKindOf({ isRepost: false, hasQuote: false, isReaction: true, isReply: true })).toBe(
    "reaction",
  );
  expect(noteAccentKindOf({ isRepost: false, hasQuote: false, isReaction: false, isReply: true })).toBe(
    "reply",
  );
});
