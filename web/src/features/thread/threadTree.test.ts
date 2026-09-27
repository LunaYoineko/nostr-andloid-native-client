import type { NostrEvent } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import {
  buildThread,
  threadAnchors,
  threadRequestFilters,
  threadRootAddressOf,
  threadRootIdOf,
} from "./threadTree";

const PK = "a".repeat(64);

/** n 番の id（64 桁 hex。番号が大きいほど id も大きい） */
function hex(n: number): string {
  return n.toString(16).padStart(64, "0");
}

/** 並べ方だけを見るので署名しないイベント */
function ev({
  id,
  kind = 1,
  createdAt = 0,
  tags = [],
}: {
  id: string;
  kind?: number;
  createdAt?: number;
  tags?: string[][];
}): NostrEvent {
  return { id, pubkey: PK, kind, created_at: createdAt, tags, content: "", sig: "" };
}

describe("threadRootIdOf", () => {
  it("kind:1 は NIP-10 の root", () => {
    const R = hex(1);
    const P = hex(2);
    expect(
      threadRootIdOf(
        ev({
          id: hex(9),
          tags: [
            ["e", R, "", "root"],
            ["e", P, "", "reply"],
          ],
        }),
      ),
    ).toBe(R);
  });

  it("マーカー無しは先頭の e", () => {
    expect(
      threadRootIdOf(
        ev({
          id: hex(9),
          tags: [
            ["e", hex(1)],
            ["e", hex(2)],
          ],
        }),
      ),
    ).toBe(hex(1));
  });

  it("mention だけなら null", () => {
    expect(threadRootIdOf(ev({ id: hex(9), tags: [["e", hex(1), "", "mention"]] }))).toBeNull();
  });

  it("kind:1111 は最初の E", () => {
    expect(
      threadRootIdOf(
        ev({
          id: hex(9),
          kind: 1111,
          tags: [
            ["E", hex(1)],
            ["e", hex(2)],
          ],
        }),
      ),
    ).toBe(hex(1));
  });

  it("kind:7 は null", () => {
    expect(threadRootIdOf(ev({ id: hex(9), kind: 7, tags: [["e", hex(1)]] }))).toBeNull();
  });
});

describe("threadRootAddressOf", () => {
  it("kind:1111 は最初の A", () => {
    expect(threadRootAddressOf(ev({ id: hex(9), kind: 1111, tags: [["A", "30023:pk:d1"]] }))).toBe(
      "30023:pk:d1",
    );
  });

  it("kind:30023 は自分自身のアドレス", () => {
    expect(threadRootAddressOf(ev({ id: hex(9), kind: 30023, tags: [["d", "x"]] }))).toBe(`30023:${PK}:x`);
  });

  it("kind:1 は null", () => {
    expect(threadRootAddressOf(ev({ id: hex(9), tags: [["A", "30023:pk:d1"]] }))).toBeNull();
  });
});

describe("threadAnchors", () => {
  it("起点が未取得なら起点だけ", () => {
    const id = hex(5);
    expect(threadAnchors(id, undefined)).toEqual({ focusId: id, ids: [id], rootId: id, address: null });
  });

  it("root マーカー付きの起点なら [起点, root]", () => {
    const id = hex(5);
    const R = hex(1);
    const anchors = threadAnchors(id, ev({ id, tags: [["e", R, "", "root"]] }));
    expect(anchors.ids).toEqual([id, R]);
    expect(anchors.rootId).toBe(R);
  });
});

describe("threadRequestFilters", () => {
  it("アドレス無しは 3 本", () => {
    const ids = [hex(5), hex(1)];
    expect(threadRequestFilters({ focusId: ids[0], ids, rootId: ids[1], address: null })).toEqual([
      { ids },
      { kinds: [1, 1111], "#e": ids, limit: 200 },
      { kinds: [1111], "#E": ids, limit: 200 },
    ]);
  });

  it("アドレスありは #A とルート本体を足して 5 本（d に : を含んでもよい）", () => {
    const ids = [hex(5)];
    const filters = threadRequestFilters({
      focusId: ids[0],
      ids,
      rootId: ids[0],
      address: `30023:${PK}:a:b`,
    });
    expect(filters).toHaveLength(5);
    expect(filters[3]).toEqual({ kinds: [1111], "#A": [`30023:${PK}:a:b`], limit: 200 });
    expect(filters[4]).toEqual({ kinds: [30023], authors: [PK], "#d": ["a:b"], limit: 1 });
  });
});

describe("buildThread", () => {
  const R = ev({ id: hex(100), createdAt: 1 });
  const A = ev({ id: hex(10), createdAt: 2, tags: [["e", R.id, "", "root"]] });
  const D = ev({ id: hex(11), createdAt: 2, tags: [["e", R.id, "", "root"]] });
  const B = ev({
    id: hex(20),
    createdAt: 3,
    tags: [
      ["e", R.id, "", "root"],
      ["e", A.id, "", "reply"],
    ],
  });
  const C = ev({ id: hex(30), createdAt: 4, tags: [["e", R.id, "", "root"]] });

  function shape(events: NostrEvent[], focusId = B.id) {
    return buildThread(events, focusId, R.id).map((e) => [e.event.id, e.depth]);
  }

  it("root から深さ優先・子は created_at 昇順（同時刻は id 昇順）", () => {
    expect(shape([C, B, D, A, R])).toEqual([
      [R.id, 0],
      [A.id, 1],
      [B.id, 2],
      [D.id, 1],
      [C.id, 1],
    ]);
  });

  it("isFocused は起点だけ、isRoot は root だけ", () => {
    const entries = buildThread([R, A, B, C, D], B.id, R.id);
    expect(entries.filter((e) => e.isFocused).map((e) => e.event.id)).toEqual([B.id]);
    expect(entries.filter((e) => e.isRoot).map((e) => e.event.id)).toEqual([R.id]);
  });

  it("親が集合に無い返信は depth 0 の起点になり、時刻順で root より前", () => {
    const X = ev({ id: hex(40), createdAt: 0, tags: [["e", hex(999), "", "root"]] });
    expect(shape([R, A, X]).slice(0, 2)).toEqual([
      [X.id, 0],
      [R.id, 0],
    ]);
  });

  it("kind:1111 は e（小文字）の親の子", () => {
    const comment = ev({
      id: hex(50),
      kind: 1111,
      createdAt: 5,
      tags: [
        ["E", R.id],
        ["e", A.id],
      ],
    });
    expect(shape([R, A, B, comment])).toEqual([
      [R.id, 0],
      [A.id, 1],
      [B.id, 2],
      [comment.id, 2],
    ]);
  });

  it("kind:7 / 6 / 30023 は行にならない", () => {
    const others = [7, 6, 30023].map((kind, i) =>
      ev({ id: hex(60 + i), kind, createdAt: 5, tags: [["e", R.id]] }),
    );
    expect(shape([R, ...others])).toEqual([[R.id, 0]]);
  });

  it("同じイベントを 2 回渡しても 1 行", () => {
    expect(shape([R, A, A])).toEqual([
      [R.id, 0],
      [A.id, 1],
    ]);
  });

  it("親子が循環する 2 件は無限ループせず結果に含まれない", () => {
    const P = ev({ id: hex(70), createdAt: 6, tags: [["e", hex(71), "", "reply"]] });
    const Q = ev({ id: hex(71), createdAt: 7, tags: [["e", hex(70), "", "reply"]] });
    expect(shape([R, P, Q])).toEqual([[R.id, 0]]);
  });
});
