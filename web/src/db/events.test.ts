import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { finalizeEvent, generateSecretKey, verifiedSymbol } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { evictOnOpen, fromRow, hydratedSymbol, OGP_PURGE_SEC, toRow } from "./events";
import { createDatabase, type EventRow } from "./schema";

const NOW = 1_800_000_000;

function testDb() {
  return createDatabase({ name: `events-${crypto.randomUUID()}`, indexedDB: new IDBFactory(), IDBKeyRange });
}

let seq = 0;
/** 署名しない行（掃除のテストでは検証しない） */
function row(kind: number, created_at = NOW, pubkey = `pk${++seq}`): EventRow {
  return { id: `id${++seq}`, pubkey, kind, created_at, content: "", tags: [], sig: "" };
}

const SEVEN = ["id", "pubkey", "kind", "created_at", "content", "tags", "sig"] as const;

it("toRow / fromRow の往復で 7 列が一致し、戻したイベントに検証済みと hydrate の印が付く", () => {
  const event = finalizeEvent(
    {
      kind: 1,
      created_at: NOW,
      tags: [
        ["t", "nostr"],
        ["t", "nostr"],
        ["e", "a".repeat(64), "wss://relay.example"],
        ["client", "nostrism"],
      ],
      content: "hi",
    },
    generateSecretKey(),
  );

  const row = toRow(event);
  expect(row.t).toEqual(["nostr"]);
  expect(row.e).toEqual(["a".repeat(64)]);
  expect(row).not.toHaveProperty("p");
  expect(row).not.toHaveProperty("client");

  const back = fromRow(row);
  for (const key of SEVEN) expect(back[key]).toEqual(event[key]);
  expect(Object.keys(back).sort()).toEqual([...SEVEN].sort());
  expect((back as unknown as Record<symbol, unknown>)[verifiedSymbol]).toBe(true);
  expect((back as unknown as Record<symbol, unknown>)[hydratedSymbol]).toBe(true);
});

it("t は小文字にして重複なしで索引し、tags 本体は変えない", () => {
  const tags = [
    ["t", "Nostr"],
    ["t", "NOSTR"],
    ["t", "web"],
    ["p", "C".repeat(64)],
  ];
  const row = toRow(finalizeEvent({ kind: 1, created_at: NOW, tags, content: "" }, generateSecretKey()));

  expect(row.t).toEqual(["nostr", "web"]);
  expect(row.p).toEqual(["C".repeat(64)]);
  expect(row.tags).toEqual(tags);
});

it("toRow は kind:30000 の p と kind:30015 の t を索引しない", () => {
  const key = generateSecretKey();
  const set = toRow(
    finalizeEvent(
      {
        kind: 30000,
        created_at: NOW,
        tags: [
          ["d", "friends"],
          ["p", "b".repeat(64)],
          ["t", "tag"],
        ],
        content: "",
      },
      key,
    ),
  );
  expect(set).not.toHaveProperty("p");
  expect(set.d).toEqual(["friends"]);
  expect(set.t).toEqual(["tag"]);

  const pins = toRow(
    finalizeEvent(
      {
        kind: 30015,
        created_at: NOW,
        tags: [
          ["d", "pins"],
          ["t", "nostr"],
          ["p", "b".repeat(64)],
        ],
        content: "",
      },
      key,
    ),
  );
  expect(pins).not.toHaveProperty("t");
  expect(pins.p).toEqual(["b".repeat(64)]);
});

it("evictOnOpen は保存しない kind を消し、未送信は kind に関係なく残す", async () => {
  const db = testDb();
  const [note, sent] = [row(1), row(1)];
  const keep = [row(0), row(0), row(0), row(3), row(30078)];
  await db.events.bulkPut([note, sent, row(7), ...keep]);
  await db.publishQueue.put({
    eventId: note.id,
    payload: { ...note },
    createdAt: NOW,
    attempts: 1,
    relays: null,
    refId: null,
  });

  await evictOnOpen(db, { now: NOW, me: null });

  const left = await db.events.toCollection().primaryKeys();
  expect(left.sort()).toEqual([note.id, ...keep.map((r) => r.id)].sort());
  db.close();
});

it("上限を超えたら kind:0 を古い順に消して trimTo 以下にし、自分の行は残す", async () => {
  const db = testDb();
  const rows = Array.from({ length: 8 }, (_, i) => row(0, NOW + i));
  const mine = rows[1];
  await db.events.bulkPut(rows);

  await evictOnOpen(db, { now: NOW, me: mine.pubkey, cap: 6, trimTo: 3 });

  expect(await db.events.count()).toBeLessThanOrEqual(3);
  const left = await db.events.toCollection().primaryKeys();
  expect(left.sort()).toEqual([mine.id, rows[6].id, rows[7].id].sort());
  db.close();
});

it("OGP キャッシュは 14 日を超えたものだけ消す", async () => {
  const db = testDb();
  await db.ogpCache.bulkPut([
    { url: "https://old.example/", fetchedAt: NOW - OGP_PURGE_SEC - 1, ok: true },
    { url: "https://edge.example/", fetchedAt: NOW - OGP_PURGE_SEC, ok: true },
    { url: "https://new.example/", fetchedAt: NOW - 60, ok: false },
  ]);

  await evictOnOpen(db, { now: NOW, me: null });

  const left = await db.ogpCache.toCollection().primaryKeys();
  expect(left.sort()).toEqual(["https://edge.example/", "https://new.example/"]);
  db.close();
});
