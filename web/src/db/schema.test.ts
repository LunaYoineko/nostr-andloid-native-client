import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { toRow } from "./events";
import { createDatabase } from "./schema";

function testDb() {
  return createDatabase({ name: `schema-${crypto.randomUUID()}`, indexedDB: new IDBFactory(), IDBKeyRange });
}

it("v1 で開き、テーブルは events / publishQueue / vault / ogpCache の 4 つ", async () => {
  const db = testDb();
  await db.open();

  expect(db.verno).toBe(1);
  expect(db.tables.map((t) => t.name).sort()).toEqual(["events", "ogpCache", "publishQueue", "vault"]);
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
