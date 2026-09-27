import type { NostrEvent } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import { buildContactsTemplate, followsFromContacts } from "./contacts";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const Z = "f".repeat(64);
const NOW = 1_700_000_000;

function contacts(tags: string[][], content = "", createdAt = NOW - 100): NostrEvent {
  return { id: "x", pubkey: "0".repeat(64), created_at: createdAt, kind: 3, tags, content, sig: "" };
}

const BASE_TAGS = [
  ["p", A, "wss://r", "alice"],
  ["t", "nostr"],
  ["p", B],
];
const BASE_CONTENT = '{"wss://x":{}}';

describe("buildContactsTemplate", () => {
  it("follow: 既存のタグ（リレーヒント・ペットネーム・t）と content をそのまま残し、末尾に p を足す", () => {
    const base = contacts(structuredClone(BASE_TAGS), BASE_CONTENT);
    const template = buildContactsTemplate(base, C, "follow", NOW);
    expect(template).toEqual({
      kind: 3,
      content: BASE_CONTENT,
      tags: [
        ["p", A, "wss://r", "alice"],
        ["t", "nostr"],
        ["p", B],
        ["p", C],
      ],
      created_at: NOW,
    });
    // 元のイベントは書き換えない
    expect(base.tags).toEqual(BASE_TAGS);
  });

  it("unfollow: その人の p タグだけを（ペットネーム付きの行ごと）消し、他は順序どおり残す", () => {
    const base = contacts(structuredClone(BASE_TAGS), BASE_CONTENT);
    expect(buildContactsTemplate(base, A, "unfollow", NOW)).toEqual({
      kind: 3,
      content: BASE_CONTENT,
      tags: [
        ["t", "nostr"],
        ["p", B],
      ],
      created_at: NOW,
    });
  });

  it("unfollow: 同じ人の p タグが複数あればすべて消す", () => {
    const base = contacts([
      ["p", A],
      ["p", B],
      ["t", "x"],
      ["p", B, "wss://r"],
    ]);
    expect(buildContactsTemplate(base, B, "unfollow", NOW)?.tags).toEqual([
      ["p", A],
      ["t", "x"],
    ]);
  });

  it("変える必要が無ければ null（既にいる人の follow・いない人の unfollow）。大文字 hex の p も「いる」", () => {
    const base = contacts(structuredClone(BASE_TAGS), BASE_CONTENT);
    expect(buildContactsTemplate(base, A, "follow", NOW)).toBeNull();
    expect(buildContactsTemplate(base, Z, "unfollow", NOW)).toBeNull();
    const upper = contacts([["p", C.toUpperCase()]]);
    expect(buildContactsTemplate(upper, C, "follow", NOW)).toBeNull();
    expect(buildContactsTemplate(upper, C, "unfollow", NOW)?.tags).toEqual([]);
  });

  it("base が無ければその 1 人だけのリスト（content は空）", () => {
    expect(buildContactsTemplate(null, C, "follow", NOW)).toEqual({
      kind: 3,
      content: "",
      tags: [["p", C]],
      created_at: NOW,
    });
    expect(buildContactsTemplate(null, C, "unfollow", NOW)).toBeNull();
  });

  it("created_at は base より必ず新しい（同じ秒の連打でも置換が崩れない）", () => {
    expect(buildContactsTemplate(contacts([], "", NOW + 5), C, "follow", NOW)?.created_at).toBe(NOW + 6);
    expect(buildContactsTemplate(contacts([], "", NOW - 5), C, "follow", NOW)?.created_at).toBe(NOW);
  });
});

describe("followsFromContacts", () => {
  it("64 桁 hex の p タグだけを小文字にして出現順で重複を除く", () => {
    const event = contacts([
      ["p", A],
      ["p", "not-hex"],
      ["t", B],
      ["p", B.toUpperCase(), "wss://r"],
      ["p", A],
      ["p", `${C}0`],
      ["p"],
      ["p", C],
    ]);
    expect(followsFromContacts(event)).toEqual([A, B, C]);
    expect(followsFromContacts(null)).toEqual([]);
    expect(followsFromContacts(undefined)).toEqual([]);
  });
});
