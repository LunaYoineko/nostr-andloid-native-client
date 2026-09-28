import type { NostrEvent } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import {
  countEngagement,
  groupReactions,
  lastETagValue,
  normalizeReaction,
  reactionTotal,
  repostersOf,
} from "./engagement";

const N = "1".repeat(64);
const OTHER = "2".repeat(64);
const [ALICE, BOB, CAROL] = ["a", "b", "c"].map((c) => c.repeat(64));

let seq = 0;

/** 集計だけを見るので署名しないイベント（id は毎回別） */
function ev(
  kind: number,
  tags: string[][],
  { pubkey = ALICE, createdAt = 0, content = "" } = {},
): NostrEvent {
  seq++;
  return {
    id: seq.toString(16).padStart(64, "f"),
    pubkey,
    kind,
    created_at: createdAt,
    tags,
    content,
    sig: "",
  };
}

it("lastETagValue は最後の e（小文字）", () => {
  expect(
    lastETagValue(
      ev(1, [
        ["e", "x"],
        ["e", "y"],
      ]),
    ),
  ).toBe("y");
  expect(lastETagValue(ev(1, [["E", "x"]]))).toBeNull();
});

it("countEngagement は最後の e が起点の返信・リポストを数える", () => {
  const replyTo = (kind: number) =>
    ev(kind, [
      ["e", OTHER, "", "root"],
      ["e", N],
    ]);
  const events = [
    replyTo(1),
    replyTo(1),
    replyTo(1111),
    replyTo(6),
    replyTo(16),
    ev(1, [
      ["e", N, "", "root"],
      ["e", OTHER],
    ]),
    ev(1111, [["E", N]]),
  ];
  expect(countEngagement(events, N)).toEqual({ replies: 3, reposts: 2 });
  // 同じイベントが重なっても 1 件
  expect(countEngagement([...events, events[0]], N)).toEqual({ replies: 3, reposts: 2 });
});

describe("normalizeReaction", () => {
  it.each([
    ["+", "❤️"],
    ["", "❤️"],
    ["-", "👎"],
    [" 🔥 ", "🔥"],
  ])("%j → %s", (content, display) => {
    expect(normalizeReaction(content, [])).toEqual({ display, imageUrl: null });
  });

  it(":code: は emoji タグの画像", () => {
    expect(normalizeReaction(":cat:", [["emoji", "cat", "https://e/cat.png"]])).toEqual({
      display: ":cat:",
      imageUrl: "https://e/cat.png",
    });
    expect(normalizeReaction(":dog:", [])).toEqual({ display: ":dog:", imageUrl: null });
  });
});

it("groupReactions は表示ごとにまとめ、人数の多い順・した人は新しい順", () => {
  const react = (pubkey: string, content: string, createdAt: number, target = N) =>
    ev(7, [["e", target]], { pubkey, content, createdAt });
  const events = [
    react(ALICE, "+", 1),
    react(BOB, "❤️", 2),
    react(CAROL, "🔥", 3),
    react(ALICE, "", 4),
    react(CAROL, "+", 5),
    react(BOB, "+", 6, OTHER),
  ];
  // ❤️: ALICE ×2（t=1, 4）・BOB（t=2、文字の ❤️ も + と同じグループ）・CAROL（t=5）。最後の e が別の BOB は数えない
  const groups = groupReactions(events, N);
  expect(groups).toEqual([
    { display: "❤️", imageUrl: null, count: 4, people: [CAROL, ALICE, BOB] },
    { display: "🔥", imageUrl: null, count: 1, people: [CAROL] },
  ]);
  expect(reactionTotal(groups)).toBe(5);
});

it("repostersOf は人ごとの最新のリポストが新しい順", () => {
  const events = [
    ev(6, [["e", N]], { pubkey: ALICE, createdAt: 5 }),
    ev(16, [["e", N]], { pubkey: BOB, createdAt: 7 }),
    ev(6, [["e", N]], { pubkey: ALICE, createdAt: 9 }),
    ev(6, [["e", OTHER]], { pubkey: CAROL, createdAt: 10 }),
  ];
  expect(repostersOf(events, N)).toEqual([ALICE, BOB]);
});
