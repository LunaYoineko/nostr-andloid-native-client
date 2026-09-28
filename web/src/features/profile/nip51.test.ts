import type { NostrEvent } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import { nip51SetAddress, nip51SetCount, parseNip51Set, parseNip51Sets } from "./nip51";

/** ネイティブ Nip51SetTest.kt の移植（テスト用の最小イベント。署名は検証しない） */
function ev(id: string, kind: number, tags: string[][], at = 100, content = ""): NostrEvent {
  return { id, pubkey: "author", kind, created_at: at, content, tags, sig: "" } as NostrEvent;
}

describe("parseNip51Set", () => {
  it("フォローセット: title・description・members を読み、重複や空値は畳む", () => {
    const e = ev("a", 30000, [
      ["d", "friends"],
      ["title", "仲良し"],
      ["description", "よく読む人"],
      ["p", "pk1"],
      ["p", "pk2"],
      ["p", "pk1"], // 重複は畳む
      ["p", ""], // 空値は無視
      ["p"], // 値なしタグも無視
    ]);
    const set = parseNip51Set(e);
    expect(set.title).toBe("仲良し");
    expect(set.description).toBe("よく読む人");
    expect(set.members).toEqual(["pk1", "pk2"]);
    expect(nip51SetCount(set)).toBe(2);
    expect(nip51SetAddress(set)).toBe("30000:author:friends");
  });

  it("title が無ければ d タグへ落ちる", () => {
    const set = parseNip51Set(
      ev("a", 30000, [
        ["d", "my-list"],
        ["p", "pk1"],
      ]),
    );
    expect(set.title).toBe("my-list");
  });

  it("ブックマークセット: eventIds・addresses を読む", () => {
    const set = parseNip51Set(
      ev("b", 30003, [
        ["d", "reads"],
        ["e", "ev1"],
        ["a", "30023:pk:slug"],
      ]),
    );
    expect(set.eventIds).toEqual(["ev1"]);
    expect(set.addresses).toEqual(["30023:pk:slug"]);
    expect(nip51SetCount(set)).toBe(2);
  });

  it("暗号化された content は hasPrivate を立てるが復号しない（公開タグのみ）", () => {
    const set = parseNip51Set(
      ev(
        "c",
        30000,
        [
          ["d", "x"],
          ["p", "pk1"],
        ],
        100,
        "cipher?iv=…",
      ),
    );
    expect(set.hasPrivate).toBe(true);
    expect(set.members).toEqual(["pk1"]);
  });
});

describe("parseNip51Sets", () => {
  it("同一座標は最新版だけを残し新しい順、空セットと対象外 kind は落ちる", () => {
    const out = parseNip51Sets([
      ev(
        "old",
        30000,
        [
          ["d", "x"],
          ["p", "pk1"],
        ],
        100,
      ),
      ev(
        "new",
        30000,
        [
          ["d", "x"],
          ["p", "pk1"],
          ["p", "pk2"],
        ],
        200,
      ),
      ev("empty", 30003, [["d", "y"]], 300), // 公開項目も非公開も無い
      ev(
        "bm",
        30003,
        [
          ["d", "z"],
          ["e", "ev1"],
        ],
        150,
      ),
      ev(
        "other",
        30001,
        [
          ["d", "w"],
          ["e", "ev2"],
        ],
        400,
      ), // 対象外 kind
    ]);
    expect(out.map((s) => s.dTag)).toEqual(["x", "z"]);
    expect(out[0].members).toEqual(["pk1", "pk2"]);
  });

  it("中身が全部非公開でも「非公開がある」ことは残す", () => {
    const out = parseNip51Sets([ev("p", 30000, [["d", "secret"]], 100, "cipher")]);
    expect(out).toHaveLength(1);
    expect(out[0].hasPrivate).toBe(true);
  });
});
