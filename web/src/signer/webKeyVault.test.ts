import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { nsecEncode } from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { afterEach, describe, expect, it } from "vitest";
import {
  createKeyVault,
  createVaultDatabase,
  type KeyVault,
  type KeyVaultDb,
  type LocalVaultRow,
  VAULT_DB_NAME,
  VAULT_ROW_ID,
  VaultError,
} from "./webKeyVault";

const databases: KeyVaultDb[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

async function openDb(): Promise<KeyVaultDb> {
  const database = createVaultDatabase({
    name: `vault-${crypto.randomUUID()}`,
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  });
  await database.open();
  databases.push(database);
  return database;
}

async function setup(): Promise<{ db: KeyVaultDb; vault: KeyVault }> {
  const db = await openDb();
  return { db, vault: createKeyVault({ database: async () => db }) };
}

async function rowOf(db: KeyVaultDb): Promise<LocalVaultRow> {
  const row = await db.vault.get(VAULT_ROW_ID);
  if (!row) throw new Error("no row");
  return row as LocalVaultRow;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

it("キャッシュの DB（nostrism）とは別の DB 名", () => {
  expect(VAULT_DB_NAME).toBe("nostrism-vault");
  expect(createVaultDatabase().name).toBe("nostrism-vault");
});

describe("importPrivateKey", () => {
  it("取り出せない AES-GCM 鍵で暗号化した 1 行を置き、公開鍵を返す", async () => {
    const { db, vault } = await setup();
    const sk = generateSecretKey();

    expect(await vault.importPrivateKey(sk)).toBe(getPublicKey(sk));
    expect(await db.vault.count()).toBe(1);
    const row = await rowOf(db);
    expect(row).toMatchObject({ id: "local", version: 1, pubkey: getPublicKey(sk) });
    expect(row.key).toBeInstanceOf(CryptoKey);
    expect(row.key.extractable).toBe(false);
    expect(row.key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    expect([...row.key.usages].sort()).toEqual(["decrypt", "encrypt"]);
    expect(row.iv.length).toBe(12);
    expect(row.ct.length).toBe(48);
    expect(Array.from(row.ct.slice(0, 32))).not.toEqual(Array.from(sk));
    await expect(crypto.subtle.exportKey("raw", row.key)).rejects.toThrow();

    const strings = Object.values(row).filter((v): v is string => typeof v === "string");
    for (const value of strings) {
      expect(value).not.toContain(nsecEncode(sk));
      expect(value).not.toContain(hex(sk));
    }
  });

  it("32 byte でなければ TypeError", async () => {
    const { vault } = await setup();
    await expect(vault.importPrivateKey(new Uint8Array(31))).rejects.toBeInstanceOf(TypeError);
  });

  it("もう 1 度取り込むと行は 1 件のまま、鍵と IV を作り直す", async () => {
    const { db, vault } = await setup();
    const sk = generateSecretKey();
    await vault.importPrivateKey(sk);
    const first = await rowOf(db);
    await vault.importPrivateKey(sk);
    const second = await rowOf(db);

    expect(await db.vault.count()).toBe(1);
    expect(hex(second.iv)).not.toBe(hex(first.iv));
    // 新しい鍵では前の暗号文を復号できない
    await expect(
      crypto.subtle.decrypt({ name: "AES-GCM", iv: first.iv }, second.key, first.ct),
    ).rejects.toThrow();
  });
});

describe("withPrivateKey", () => {
  it("復号した秘密鍵を渡し、終わったら同じ配列を 0 で埋める（例外でも）", async () => {
    const { vault } = await setup();
    const sk = generateSecretKey();
    await vault.importPrivateKey(sk);

    let seen: Uint8Array | null = null;
    const copy = await vault.withPrivateKey((key) => {
      seen = key;
      return Array.from(key);
    });
    expect(copy).toEqual(Array.from(sk));
    expect(Array.from(seen ?? [1]).every((b) => b === 0)).toBe(true);

    let thrown: Uint8Array | null = null;
    await expect(
      vault.withPrivateKey((key) => {
        thrown = key;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(Array.from(thrown ?? [1]).every((b) => b === 0)).toBe(true);
  });
});

describe("storedPubkey / clear", () => {
  it("保管中の公開鍵を返し、clear で消える", async () => {
    const { db, vault } = await setup();
    const sk = generateSecretKey();
    await vault.importPrivateKey(sk);
    expect(await vault.storedPubkey()).toBe(getPublicKey(sk));

    await vault.clear();
    expect(await db.vault.count()).toBe(0);
    expect(await vault.storedPubkey()).toBeNull();
    await expect(vault.withPrivateKey(() => 0)).rejects.toMatchObject({
      name: "VaultError",
      reason: "missing",
    });
  });

  it("暗号文が壊れた行は corrupt、storedPubkey は null にして行を消す", async () => {
    const { db, vault } = await setup();
    await vault.importPrivateKey(generateSecretKey());
    const row = await rowOf(db);
    row.ct[0] ^= 1;
    await db.vault.put(row);

    const error = await vault.withPrivateKey(() => 0).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultError);
    expect(error).toMatchObject({ reason: "corrupt" });
    expect(await vault.storedPubkey()).toBeNull();
    expect(await db.vault.count()).toBe(0);
  });

  it("公開鍵が秘密鍵と合わない行も null にして行を消す", async () => {
    const { db, vault } = await setup();
    await vault.importPrivateKey(generateSecretKey());
    const row = await rowOf(db);
    await db.vault.put({ ...row, pubkey: getPublicKey(generateSecretKey()) });

    expect(await vault.storedPubkey()).toBeNull();
    expect(await db.vault.count()).toBe(0);
  });

  it("形の違う行も null にして行を消す", async () => {
    const { db, vault } = await setup();
    await db.vault.put({ id: VAULT_ROW_ID, pubkey: "xyz" });

    expect(await vault.storedPubkey()).toBeNull();
    expect(await db.vault.count()).toBe(0);
  });
});

describe("保管先が使えない", () => {
  it("DB が無ければ取り込みは unavailable、storedPubkey は null、clear は解決する", async () => {
    const vault = createKeyVault({ database: async () => null });
    await expect(vault.importPrivateKey(generateSecretKey())).rejects.toMatchObject({
      reason: "unavailable",
    });
    await expect(vault.generate()).rejects.toMatchObject({ reason: "unavailable" });
    await expect(vault.withPrivateKey(() => 0)).rejects.toMatchObject({ reason: "unavailable" });
    expect(await vault.storedPubkey()).toBeNull();
    await expect(vault.clear()).resolves.toBeUndefined();
  });

  it("WebCrypto が無ければ unavailable で、行は消さない", async () => {
    const db = await openDb();
    await createKeyVault({ database: async () => db }).importPrivateKey(generateSecretKey());
    const vault = createKeyVault({ database: async () => db, subtle: () => undefined });

    await expect(vault.importPrivateKey(generateSecretKey())).rejects.toMatchObject({
      reason: "unavailable",
    });
    expect(await vault.storedPubkey()).toBeNull();
    expect(await db.vault.count()).toBe(1);
  });
});

describe("generate", () => {
  it("新しい鍵を保管して公開鍵を返す。2 回で別の鍵", async () => {
    const { vault } = await setup();
    const first = await vault.generate();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await vault.storedPubkey()).toBe(first);
    expect(await vault.withPrivateKey((sk) => getPublicKey(sk))).toBe(first);

    const second = await vault.generate();
    expect(second).not.toBe(first);
    expect(await vault.storedPubkey()).toBe(second);
  });
});

describe("直列化", () => {
  it("削除の直後の保存は消されない", async () => {
    const { db, vault } = await setup();
    await vault.importPrivateKey(generateSecretKey());
    const sk = generateSecretKey();
    void vault.clear();
    await vault.importPrivateKey(sk);

    expect(await db.vault.count()).toBe(1);
    expect(await vault.storedPubkey()).toBe(getPublicKey(sk));
  });

  it("保存の直後の削除で 0 件", async () => {
    const { db, vault } = await setup();
    void vault.importPrivateKey(generateSecretKey());
    await vault.clear();

    expect(await db.vault.count()).toBe(0);
  });

  it("前の操作の失敗は次を止めない", async () => {
    const { db, vault } = await setup();
    const failed = vault.importPrivateKey(new Uint8Array(1));
    const sk = generateSecretKey();
    const next = vault.importPrivateKey(sk);

    await expect(failed).rejects.toBeInstanceOf(TypeError);
    expect(await next).toBe(getPublicKey(sk));
    expect(await db.vault.count()).toBe(1);
  });
});
