import { neventEncode, npubEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import { buildNote, buildQuote, buildReply, type PostContext } from "./buildPost";

const CAT = "https://e/cat.png";

function ctx(overrides: Partial<PostContext> = {}): PostContext {
  return {
    me: getPublicKey(generateSecretKey()),
    emojis: new Map([["cat", CAT]]),
    hints: { eventHint: () => "", pubkeyHint: () => "" },
    lookup: () => undefined,
    ...overrides,
  };
}

function event(kind: number, tags: string[][] = [], content = "元"): NostrEvent {
  return finalizeEvent({ kind, created_at: 1_800_000_000, tags, content }, generateSecretKey());
}

describe("buildNote", () => {
  it("t → emoji → メンションの p（ヒント枠付き）→ content-warning", () => {
    const a = getPublicKey(generateSecretKey());
    const draft = buildNote(`#Nostr :cat: hi nostr:${npubEncode(a)}`, "", ctx());
    expect(draft.kind).toBe(1);
    expect(draft.tags).toEqual([
      ["t", "nostr"],
      ["emoji", "cat", CAT],
      ["p", a, ""],
      ["content-warning", ""],
    ]);
    expect(buildNote("hi", null, ctx()).tags).toEqual([]);
  });
});

describe("buildReply", () => {
  it("kind:1 のルート投稿へは kind 1・先頭が root の e（ヒント入り）", () => {
    const target = event(1);
    const draft = buildReply(
      target,
      "返信",
      null,
      ctx({ hints: { eventHint: () => "wss://h", pubkeyHint: () => "" } }),
    );
    expect(draft.kind).toBe(1);
    expect(draft.tags[0]).toEqual(["e", target.id, "wss://h", "root", target.pubkey]);
  });

  it("途中への返信はストアのルート作者を 5 番目に入れる", () => {
    const root = event(1);
    const target = event(1, [["e", root.id, "", "root"]]);
    const draft = buildReply(target, "x", null, ctx({ lookup: (id) => (id === root.id ? root : undefined) }));
    expect(draft.tags.slice(0, 2)).toEqual([
      ["e", root.id, "", "root", root.pubkey],
      ["e", target.id, "", "reply", target.pubkey],
    ]);
  });

  it("kind:1111 へは kind 1111 で E / K / P を継承", () => {
    const rootAuthor = getPublicKey(generateSecretKey());
    const target = event(1111, [
      ["E", "f".repeat(64), "wss://r", rootAuthor],
      ["K", "1"],
      ["P", rootAuthor],
    ]);
    const draft = buildReply(target, "c", null, ctx());
    expect(draft.kind).toBe(1111);
    expect(draft.tags.slice(0, 3)).toEqual([
      ["E", "f".repeat(64), "wss://r", rootAuthor],
      ["K", "1"],
      ["P", rootAuthor, ""],
    ]);
    expect(draft.tags.slice(3, 6)).toEqual([
      ["e", target.id, "", target.pubkey],
      ["k", "1111"],
      ["p", target.pubkey, ""],
    ]);
  });

  it("本文で返信先の作者をメンションしても p が重複しない", () => {
    const target = event(1);
    const draft = buildReply(target, `nostr:${npubEncode(target.pubkey)} ありがとう`, "cw", ctx());
    expect(draft.tags.filter((t) => t[0] === "p" && t[1] === target.pubkey)).toHaveLength(1);
    expect(draft.tags.at(-1)).toEqual(["content-warning", "cw"]);
  });
});

describe("buildQuote", () => {
  it("q（ヒント入り）→ 作者の p、本文の末尾に同じヒントの nevent", () => {
    const target = event(1);
    const draft = buildQuote(
      target,
      "見て",
      null,
      ctx({ hints: { eventHint: () => "wss://h", pubkeyHint: () => "" } }),
    );
    const ref = neventEncode({
      id: target.id,
      author: target.pubkey,
      kind: target.kind,
      relays: ["wss://h"],
    });
    expect(draft.kind).toBe(1);
    expect(draft.content).toBe(`見て\nnostr:${ref}`);
    expect(draft.tags[0]).toEqual(["q", target.id, "wss://h", target.pubkey]);
    expect(draft.tags[1]).toEqual(["p", target.pubkey, ""]);
  });

  it("本文が空なら nevent だけ", () => {
    const target = event(1);
    const draft = buildQuote(target, "", null, ctx());
    expect(draft.content).toMatch(/^nostr:nevent1[0-9a-z]+$/);
  });
});
