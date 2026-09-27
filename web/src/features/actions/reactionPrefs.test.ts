import { afterEach, expect, it, vi } from "vitest";
import {
  DEFAULT_REACTION_KEY,
  loadRecentEmojis,
  RECENT_EMOJIS_KEY,
  RECENT_EMOJIS_MAX,
  recordUsedEmoji,
  setDefaultReaction,
  useDefaultReaction,
} from "./reactionPrefs";

afterEach(() => {
  localStorage.clear();
  useDefaultReaction.setState({ content: "+", image: null });
  vi.useRealTimers();
});

/** 保存値を入れてからモジュールを読み直し、初期値を返す */
async function initialWith(saved: string | null) {
  if (saved !== null) localStorage.setItem(DEFAULT_REACTION_KEY, saved);
  vi.resetModules();
  const fresh = await import("./reactionPrefs");
  return fresh.useDefaultReaction.getState();
}

it("既定リアクションの初期値は + / 画像なし", async () => {
  expect(await initialWith(null)).toEqual({ content: "+", image: null });
});

it("保存値があればそれを初期値にする。壊れた JSON・content が文字列でなければ + に戻す", async () => {
  expect(await initialWith(JSON.stringify({ content: ":cat:", image: "https://e/cat.png" }))).toEqual({
    content: ":cat:",
    image: "https://e/cat.png",
  });
  localStorage.clear();
  expect(await initialWith("{broken")).toEqual({ content: "+", image: null });
  localStorage.clear();
  expect(await initialWith(JSON.stringify({ content: 1 }))).toEqual({ content: "+", image: null });
});

it("setDefaultReaction でストアと localStorage が変わる", () => {
  setDefaultReaction("⭐", null);
  expect(useDefaultReaction.getState()).toEqual({ content: "⭐", image: null });
  expect(JSON.parse(localStorage.getItem(DEFAULT_REACTION_KEY) ?? "null")).toEqual({
    content: "⭐",
    image: null,
  });
});

it("recordUsedEmoji: + と空は記録しない", () => {
  recordUsedEmoji("+", null);
  recordUsedEmoji("", null);
  expect(loadRecentEmojis()).toEqual([]);
});

it("recordUsedEmoji: 同じ絵文字は uses を増やして先頭へ。画像 URL は上書きする", () => {
  recordUsedEmoji(":cat:", "https://e/old.png");
  recordUsedEmoji("🔥", null);
  recordUsedEmoji(":cat:", "https://e/cat.png");
  const list = loadRecentEmojis();
  expect(list.map((r) => r.content)).toEqual([":cat:", "🔥"]);
  expect(list[0]).toMatchObject({ uses: 2, imageUrl: "https://e/cat.png" });
  expect(list[1]).toMatchObject({ uses: 1, imageUrl: null });
});

it("recordUsedEmoji: 65 件使うと古いものから落ちて 64 件", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  for (let i = 0; i < 65; i++) {
    vi.setSystemTime(1_800_000_000_000 + i * 1000);
    recordUsedEmoji(`e${i}`, null);
  }
  const list = loadRecentEmojis();
  expect(list).toHaveLength(RECENT_EMOJIS_MAX);
  expect(list[0].content).toBe("e64");
  expect(list.some((r) => r.content === "e0")).toBe(false);
});

it("loadRecentEmojis: 壊れた保存値は空、新しい順に並べる", () => {
  localStorage.setItem(RECENT_EMOJIS_KEY, "{broken");
  expect(loadRecentEmojis()).toEqual([]);
  localStorage.setItem(
    RECENT_EMOJIS_KEY,
    JSON.stringify([
      { content: "a", imageUrl: null, lastUsed: 1, uses: 1 },
      { content: "b", imageUrl: null, lastUsed: 3, uses: 1 },
      { content: 1 },
    ]),
  );
  expect(loadRecentEmojis().map((r) => r.content)).toEqual(["b", "a"]);
});
