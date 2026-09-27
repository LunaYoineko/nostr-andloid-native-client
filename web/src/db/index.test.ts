import Dexie from "dexie";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";
import { SESSION_KEY } from "../signer/session";
import { openDatabase, requestPersistentStorage } from "./index";
import { createDatabase, DB_NAME, type NostrismDb } from "./schema";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete (navigator as { storage?: unknown }).storage;
});

function testDeps() {
  return { name: `index-${crypto.randomUUID()}`, indexedDB: new IDBFactory(), IDBKeyRange };
}

it("新しい版の同名 DB があっても 4 テーブルの v1 で開く", async () => {
  // Dexie 4 は版が下がるとき VersionError を自分で拾い、既存の版に足りないテーブルを足して開く（警告を出す）
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const deps = testDeps();
  const newer = new Dexie(deps.name, { indexedDB: deps.indexedDB, IDBKeyRange });
  newer.version(2).stores({ x: "id" });
  await newer.open();
  newer.close();

  const db = await openDatabase(() => createDatabase(deps));

  expect(db?.verno).toBe(1);
  expect(db?.tables.map((t) => t.name).sort()).toEqual(["events", "ogpCache", "publishQueue", "vault"]);
  db?.close();
});

it("開けなければ DB を消して 1 度だけ作り直し、それでも駄目なら null", async () => {
  const deleteDb = vi.spyOn(Dexie, "delete").mockResolvedValue(undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const deps = testDeps();
  const broken = () => {
    const db = createDatabase(deps);
    vi.spyOn(db, "open").mockRejectedValue(new Dexie.UpgradeError("broken"));
    return db;
  };

  const create = vi.fn<() => NostrismDb>().mockImplementationOnce(broken);
  create.mockImplementationOnce(() => createDatabase(deps));
  const db = await openDatabase(create);
  expect(deleteDb).toHaveBeenCalledWith(DB_NAME);
  expect(create).toHaveBeenCalledTimes(2);
  expect(db?.verno).toBe(1);
  db?.close();

  expect(await openDatabase(broken)).toBeNull();
  expect(error).toHaveBeenCalledTimes(1);
});

it("永続化の依頼はログイン済みのときだけ", async () => {
  const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };
  Object.defineProperty(navigator, "storage", { configurable: true, value: storage });

  expect(await requestPersistentStorage()).toBe(false);
  expect(storage.persist).not.toHaveBeenCalled();

  localStorage.setItem(SESSION_KEY, JSON.stringify({ method: "nip07", pubkey: "a".repeat(64) }));
  expect(await requestPersistentStorage()).toBe(true);
  expect(storage.persist).toHaveBeenCalledTimes(1);
});
