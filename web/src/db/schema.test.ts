import Dexie from "dexie";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { toRow } from "./events";
import { createDatabase } from "./schema";

function testDb() {
  return createDatabase({ name: `schema-${crypto.randomUUID()}`, indexedDB: new IDBFactory(), IDBKeyRange });
}

it("v3 で開き、テーブルは events / publishQueue / vault / ogpCache / dmMessages / dmProcessed / deletedEvents / deletedAddrs の 8 つ", async () => {
  const db = testDb();
  await db.open();

  expect(db.verno).toBe(3);
  expect(db.tables.map((t) => t.name).sort()).toEqual([
    "deletedAddrs",
    "deletedEvents",
    "dmMessages",
    "dmProcessed",
    "events",
    "ogpCache",
    "publishQueue",
    "vault",
  ]);
  db.close();
});

it("版 1 の DB（events に行がある）を版 3 で開くと、events の行が残り dm・削除記録の表が増える", async () => {
  const name = `schema-${crypto.randomUUID()}`;
  const indexedDB = new IDBFactory();
  // #451 の版 1 のスキーマ
  const v1 = new Dexie(name, { indexedDB, IDBKeyRange });
  v1.version(1).stores({
    events: "id, pubkey, kind, created_at, [kind+pubkey], [kind+created_at], *t, *e, *p, *q, *E, *A, *d",
    publishQueue: "eventId, createdAt, attempts, refId",
    vault: "id",
    ogpCache: "url, fetchedAt",
  });
  const note = finalizeEvent(
    { kind: 1, created_at: 1_700_000_000, tags: [["t", "nostr"]], content: "hello" },
    generateSecretKey(),
  );
  await v1.table("events").put(toRow(note));
  v1.close();

  const db = createDatabase({ name, indexedDB, IDBKeyRange });
  await db.open();

  expect(db.verno).toBe(3);
  expect(await db.events.get(note.id)).toMatchObject({ id: note.id, content: "hello", t: ["nostr"] });
  expect(await db.events.where("t").equals("nostr").count()).toBe(1);
  await db.dmMessages.put({
    owner: "me",
    id: "m1",
    peer: "p",
    sender: "p",
    content: "hi",
    tags: [],
    createdAt: 1,
    proto: "nip17",
  });
  await db.dmProcessed.put({ owner: "me", eventId: "w1", ok: true });
  expect(await db.dmMessages.where("[owner+peer]").equals(["me", "p"]).count()).toBe(1);
  expect(await db.dmProcessed.where("owner").equals("me").count()).toBe(1);
  await db.deletedEvents.put({ id: "d1", deletedAt: 1 });
  await db.deletedAddrs.put({ coord: "30023:pk:x", deletedAt: 1 });
  expect(await db.deletedEvents.get("d1")).toBeDefined();
  expect(await db.deletedAddrs.get("30023:pk:x")).toBeDefined();
  db.close();
});

it("版 2 の DB（events に行がある）を版 3 で開くと、events の行が残り deletedEvents / deletedAddrs の 2 表が増える", async () => {
  const name = `schema-${crypto.randomUUID()}`;
  const indexedDB = new IDBFactory();
  // #504 の版 2 のスキーマ
  const v2 = new Dexie(name, { indexedDB, IDBKeyRange });
  v2.version(2).stores({
    events: "id, pubkey, kind, created_at, [kind+pubkey], [kind+created_at], *t, *e, *p, *q, *E, *A, *d",
    publishQueue: "eventId, createdAt, attempts, refId",
    vault: "id",
    ogpCache: "url, fetchedAt",
    dmMessages: "[owner+id], owner, [owner+peer]",
    dmProcessed: "[owner+eventId], owner",
  });
  const note = finalizeEvent(
    { kind: 1, created_at: 1_700_000_000, tags: [["t", "nostr"]], content: "hello" },
    generateSecretKey(),
  );
  await v2.table("events").put(toRow(note));
  v2.close();

  const db = createDatabase({ name, indexedDB, IDBKeyRange });
  await db.open();

  expect(db.verno).toBe(3);
  expect(await db.events.get(note.id)).toMatchObject({ id: note.id, content: "hello", t: ["nostr"] });
  await db.deletedEvents.put({ id: note.id, deletedAt: 1_700_000_001 });
  await db.deletedAddrs.put({ coord: `30023:${note.pubkey}:x`, deletedAt: 1_700_000_001 });
  expect(await db.deletedEvents.count()).toBe(1);
  expect(await db.deletedAddrs.count()).toBe(1);
  db.close();
});

it("タグ値の配列列と複合索引で引ける", async () => {
  const db = testDb();
  const key = generateSecretKey();
  const pubkey = getPublicKey(key);
  const note = finalizeEvent(
    {
      kind: 1,
      created_at: 1_700_000_000,
      tags: [
        ["t", "nostr"],
        ["t", "web"],
      ],
      content: "hello",
    },
    key,
  );
  await db.events.put(toRow(note));

  expect(await db.events.where("t").equals("nostr").count()).toBe(1);
  expect(await db.events.where("[kind+pubkey]").equals([1, pubkey]).count()).toBe(1);
  db.close();
});
