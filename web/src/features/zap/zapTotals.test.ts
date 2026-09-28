import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import { formatSats, zapTotals } from "./zapTotals";

const LNURL_SERVER = generateSecretKey();

/** noteId への Zap 受領（kind:9735）。金額は Zap リクエストの amount（msat） */
function receipt(
  noteId: string,
  { sats = 21, sender = getPublicKey(generateSecretKey()), comment = "", createdAt = 1_000 } = {},
): NostrEvent {
  const request = {
    kind: 9734,
    pubkey: sender,
    content: comment,
    tags: [
      ["amount", String(sats * 1000)],
      ["e", noteId],
    ],
  };
  return finalizeEvent(
    {
      kind: 9735,
      created_at: createdAt,
      tags: [
        ["e", noteId],
        ["P", sender],
        ["description", JSON.stringify(request)],
      ],
      content: "",
    },
    LNURL_SERVER,
  );
}

describe("formatSats（ネイティブ NoteItem.kt formatSats と同じ）", () => {
  it("1,000 未満はそのまま、以上は k、1,000,000 以上は M（小数 1 桁・切り捨て）", () => {
    expect(formatSats(0)).toBe("0");
    expect(formatSats(999)).toBe("999");
    expect(formatSats(1000)).toBe("1.0k");
    expect(formatSats(1234)).toBe("1.2k");
    expect(formatSats(999999)).toBe("999.9k");
    expect(formatSats(1000000)).toBe("1.0M");
    expect(formatSats(1234567)).toBe("1.2M");
  });
});

describe("zapTotals", () => {
  const A = "a".repeat(64);
  const B = "b".repeat(64);

  it("同じ receipt を 2 回入れても 1 回分", () => {
    const zap = receipt(A, { sats: 100 });
    const totals = zapTotals([zap, zap]);
    expect(totals.get(A)?.totalSats).toBe(100);
    expect(totals.get(A)?.zaps).toHaveLength(1);
  });

  it("別ノートの receipt が混ざらない", () => {
    const totals = zapTotals([receipt(A, { sats: 100 }), receipt(B, { sats: 5 }), receipt(A, { sats: 21 })]);
    expect(totals.get(A)?.totalSats).toBe(121);
    // 同時刻は入ってきた順
    expect(totals.get(A)?.zaps.map((z) => z.sats)).toEqual([100, 21]);
    expect(totals.get(B)?.totalSats).toBe(5);
    expect(totals.get(B)?.zaps).toHaveLength(1);
  });

  it("コメントの有無・送り主・時刻を保ち、新しい順に並べる", () => {
    const alice = getPublicKey(generateSecretKey());
    const older = receipt(A, { sats: 21, sender: alice, comment: "いいね", createdAt: 1_000 });
    const newer = receipt(A, { sats: 50, createdAt: 2_000 });
    const [first, second] = zapTotals([older, newer]).get(A)?.zaps ?? [];
    expect(first).toMatchObject({ id: newer.id, sats: 50, comment: "", createdAt: 2_000 });
    expect(second).toEqual({ id: older.id, sender: alice, sats: 21, comment: "いいね", createdAt: 1_000 });
  });

  it("送り主が分からない receipt も合計には入る。e タグの無い receipt と 9735 以外は数えない", () => {
    const anonymous = finalizeEvent(
      {
        kind: 9735,
        created_at: 1_000,
        tags: [
          ["e", A],
          ["bolt11", "lnbc10u1pxxxxxx"],
        ],
        content: "",
      },
      LNURL_SERVER,
    );
    const noTarget = finalizeEvent(
      { kind: 9735, created_at: 1_000, tags: [["bolt11", "lnbc10u1pxxxxxx"]], content: "" },
      LNURL_SERVER,
    );
    const note = finalizeEvent({ kind: 1, created_at: 1_000, tags: [["e", A]], content: "" }, LNURL_SERVER);
    const totals = zapTotals([anonymous, noTarget, note]);
    expect(totals.get(A)).toEqual({
      totalSats: 1_000,
      zaps: [{ id: anonymous.id, sender: null, sats: 1_000, comment: "", createdAt: 1_000 }],
    });
    expect(totals.size).toBe(1);
  });
});
