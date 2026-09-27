import { nprofileEncode, npubEncode } from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import {
  emojiTagsIn,
  fillRelayHints,
  hashtagsIn,
  isPublicRelay,
  mentionPTags,
  mentionPubkeysIn,
  nip10ReplyTags,
  nip22ReplyTags,
  pickRelayHint,
  rootOf,
} from "./tags";

const pk = () => getPublicKey(generateSecretKey());
const T = "a".repeat(64);
const R = "b".repeat(64);

describe("本文から取るタグ", () => {
  it("hashtagsIn: 小文字・重複除去・出現順。URL 内の # も拾う", () => {
    expect(hashtagsIn("#Nostr #nostr #日本語 #a_b #1 # #x-y https://x.co/#frag")).toEqual([
      "nostr",
      "日本語",
      "a_b",
      "1",
      "x",
      "frag",
    ]);
  });

  it("emojiTagsIn: 既知の shortcode だけ（重複除去・出現順）", () => {
    const known = new Map([
      ["cat", "https://e/cat.png"],
      ["a", "https://e/a.png"],
    ]);
    expect(emojiTagsIn(":cat: :dog: :cat: :a:b:", known)).toEqual([
      ["emoji", "cat", "https://e/cat.png"],
      ["emoji", "a", "https://e/a.png"],
    ]);
  });

  it("mentionPubkeysIn: nostr:npub と行頭の nprofile を拾い、URL 内は拾わない", () => {
    const [a, b, c] = [pk(), pk(), pk()];
    const content = `nostr:${npubEncode(a)} こんにちは\n${nprofileEncode({ pubkey: b })} https://x.com/${npubEncode(c)} nostr:${npubEncode(a)}`;
    expect(mentionPubkeysIn(content)).toEqual([a, b]);
    expect(mentionPTags(content, [a])).toEqual([["p", b]]);
  });
});

describe("NIP-10 / NIP-22", () => {
  it("(a) e タグの無い投稿への返信は root の e 1 本 + 作者の p", () => {
    const [a, s] = [pk(), pk()];
    expect(
      nip10ReplyTags({ targetId: T, targetPubkey: a, targetTags: [], rootAuthor: null, selfPubkey: s }),
    ).toEqual([
      ["e", T, "", "root", a],
      ["p", a],
    ]);
  });

  it("(b) 途中への返信は root → reply、p は継承（自分を除く）+ 末尾に作者", () => {
    const [a, b, c, s, ra] = [pk(), pk(), pk(), pk(), pk()];
    const targetTags = [
      ["e", R, "", "root"],
      ["p", b],
      ["p", s],
      ["p", c],
      ["p", a],
    ];
    expect(
      nip10ReplyTags({ targetId: T, targetPubkey: a, targetTags, rootAuthor: ra, selfPubkey: s }),
    ).toEqual([
      ["e", R, "", "root", ra],
      ["e", T, "", "reply", a],
      ["p", b],
      ["p", c],
      ["p", a],
    ]);
  });

  it("(c) ルートの作者が分からなければ root の e は 4 要素", () => {
    const tags = nip10ReplyTags({
      targetId: T,
      targetPubkey: pk(),
      targetTags: [["e", R, "", "root"]],
      rootAuthor: null,
      selfPubkey: null,
    });
    expect(tags[0]).toEqual(["e", R, "", "root"]);
  });

  it("(d) 返信先が自分なら作者の p を付けない", () => {
    const s = pk();
    expect(
      nip10ReplyTags({ targetId: T, targetPubkey: s, targetTags: [], rootAuthor: null, selfPubkey: s }),
    ).toEqual([["e", T, "", "root", s]]);
  });

  it("(e) 継承する p が多ければ 16 本に切り、最後は返信先の作者", () => {
    const a = pk();
    const many = Array.from({ length: 20 }, () => ["p", pk()]);
    const ps = nip10ReplyTags({
      targetId: T,
      targetPubkey: a,
      targetTags: many,
      rootAuthor: null,
      selfPubkey: null,
    })
      .filter((t) => t[0] === "p")
      .map((t) => t[1]);
    expect(ps).toHaveLength(16);
    expect(ps.at(-1)).toBe(a);
  });

  it("rootOf: root マーカー優先、マーカー無しは先頭、mention だけなら null", () => {
    expect(
      rootOf([
        ["e", T],
        ["e", R, "", "root"],
      ]),
    ).toBe(R);
    expect(
      rootOf([
        ["e", T],
        ["e", R],
      ]),
    ).toBe(T);
    expect(rootOf([["e", T, "", "mention"]])).toBeNull();
    expect(rootOf([])).toBeNull();
  });

  it("nip22ReplyTags: 親のルートタグを継承、無ければ親をルートに立てる", () => {
    const [p, root] = [pk(), pk()];
    const parentTags = [
      ["E", R, "wss://r", root],
      ["K", "1"],
      ["P", root],
      ["e", R],
      ["p", root],
    ];
    expect(nip22ReplyTags(T, p, parentTags)).toEqual([
      ["E", R, "wss://r", root],
      ["K", "1"],
      ["P", root],
      ["e", T, "", p],
      ["k", "1111"],
      ["p", p],
    ]);
    expect(nip22ReplyTags(T, p, [])).toEqual([
      ["E", T, "", p],
      ["K", "1111"],
      ["P", p],
      ["e", T, "", p],
      ["k", "1111"],
      ["p", p],
    ]);
  });
});

describe("リレーヒント", () => {
  it("isPublicRelay: wss:// の公開ホストだけ", () => {
    expect(isPublicRelay("wss://relay.damus.io")).toBe(true);
    for (const url of [
      "ws://x.com",
      "wss://localhost",
      "wss://192.168.1.2",
      "wss://10.0.0.1:443",
      "wss://[::1]",
      "wss://foo.local",
    ]) {
      expect(isPublicRelay(url), url).toBe(false);
    }
  });

  it("pickRelayHint: 受信元 ∩ write → write の先頭 → 受信元。除外・非公開は飛ばし、無ければ空", () => {
    const none = new Set<string>();
    expect(pickRelayHint(["wss://s", "wss://w2"], ["wss://w1", "wss://w2"], none)).toBe("wss://w2");
    expect(pickRelayHint(["wss://s"], ["wss://w1"], none)).toBe("wss://w1");
    expect(pickRelayHint(["wss://s"], [], none)).toBe("wss://s");
    expect(pickRelayHint(["wss://localhost", "wss://s"], ["wss://x"], new Set(["wss://x"]))).toBe("wss://s");
    expect(pickRelayHint([], [], none)).toBe("");
  });

  it("fillRelayHints: 空き枠だけ埋め、2 要素は '' でも 3 要素にする", () => {
    const id = T;
    const p = pk();
    const filled = fillRelayHints(
      [
        ["e", id],
        ["e", id, "", "root", p],
        ["p", p, "wss://keep"],
        ["t", "x"],
      ],
      () => "wss://h",
      () => "wss://p",
    );
    expect(filled).toEqual([
      ["e", id, "wss://h"],
      ["e", id, "wss://h", "root", p],
      ["p", p, "wss://keep"],
      ["t", "x"],
    ]);
    expect(
      fillRelayHints(
        [["p", p]],
        () => "",
        () => "",
      ),
    ).toEqual([["p", p, ""]]);
  });
});
