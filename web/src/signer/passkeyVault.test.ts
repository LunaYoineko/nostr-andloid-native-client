import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPasskeyVault,
  isPasskeySupported,
  PASSKEY_ROW_ID,
  type PasskeyVaultRow,
  type WebAuthnCredential,
  type WebAuthnCredentials,
} from "./passkeyVault";
import {
  createKeyVault,
  createVaultDatabase,
  type KeyVault,
  type KeyVaultDb,
  VAULT_ROW_ID,
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

async function rowOf(db: KeyVaultDb): Promise<PasskeyVaultRow> {
  const row = await db.vault.get(PASSKEY_ROW_ID);
  if (!row) throw new Error("no row");
  return row as PasskeyVaultRow;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type FakeOpts = {
  /** create の応答に入れる PRF。登録では使われないはずなので get と別の値で検証できる */
  createPrf?: Uint8Array<ArrayBuffer> | null;
  /** get が返す PRF。省略時は allowCredentials の id ごとに一貫した値、null なら PRF 非対応を模す */
  getPrf?: Uint8Array<ArrayBuffer> | null;
  failCreate?: boolean;
  failGet?: boolean;
};

type FakeCredentials = WebAuthnCredentials & {
  createCalls: { extensions: unknown }[];
  getCalls: { rpId: string; allowCredentials: Uint8Array<ArrayBuffer>[]; extensions: unknown }[];
};

/** navigator.credentials の最小限のフェイク。get は allowCredentials の id ごとに一貫した PRF を返す */
function fakeCredentials(opts: FakeOpts = {}): FakeCredentials {
  const prfById = new Map<string, Uint8Array<ArrayBuffer>>();
  let rawIdSeq = 0;
  const createCalls: { extensions: unknown }[] = [];
  const getCalls: { rpId: string; allowCredentials: Uint8Array<ArrayBuffer>[]; extensions: unknown }[] = [];
  return {
    createCalls,
    getCalls,
    async create({ publicKey }) {
      createCalls.push({ extensions: publicKey.extensions });
      if (opts.failCreate) throw new Error("cancelled");
      rawIdSeq++;
      const rawId: Uint8Array<ArrayBuffer> = new Uint8Array([9, 9, 9, rawIdSeq]);
      const createPrf = opts.createPrf;
      return {
        rawId: rawId.buffer,
        getClientExtensionResults: () =>
          createPrf === undefined
            ? {}
            : { prf: { results: createPrf === null ? {} : { first: createPrf.buffer } } },
      } satisfies WebAuthnCredential;
    },
    async get({ publicKey }) {
      const allowCredentials = publicKey.allowCredentials.map((c) => new Uint8Array(c.id));
      getCalls.push({ rpId: publicKey.rpId, allowCredentials, extensions: publicKey.extensions });
      if (opts.failGet) throw new Error("cancelled");
      const id: Uint8Array<ArrayBuffer> = allowCredentials[0] ?? new Uint8Array();
      let prf: Uint8Array<ArrayBuffer> | null;
      if (opts.getPrf !== undefined) {
        prf = opts.getPrf;
      } else {
        const key = hex(id);
        prf = prfById.get(key) ?? null;
        if (!prf) {
          prf = crypto.getRandomValues(new Uint8Array(32));
          prfById.set(key, prf);
        }
      }
      return {
        rawId: id.buffer,
        getClientExtensionResults: () =>
          prf === null ? { prf: { results: {} } } : { prf: { results: { first: prf.buffer } } },
      } satisfies WebAuthnCredential;
    },
  };
}

async function setup(fakeOpts: FakeOpts = {}) {
  const db = await openDb();
  const localVault = createKeyVault({ database: async () => db });
  const creds = fakeCredentials(fakeOpts);
  const vault = createPasskeyVault({
    database: async () => db,
    localVault: () => localVault,
    credentials: () => creds,
    rpId: () => "test.example",
  });
  return { db, localVault, creds, vault };
}

describe("enroll", () => {
  it("成功すると local 行が消えて passkey 行ができ、解錠済みになる", async () => {
    const { db, localVault, vault } = await setup();
    const sk = generateSecretKey();
    await localVault.importPrivateKey(sk);

    const pubkey = await vault.enroll();

    expect(pubkey).toBe(getPublicKey(sk));
    expect(await db.vault.get(VAULT_ROW_ID)).toBeUndefined();
    const row = await rowOf(db);
    expect(row).toMatchObject({ id: PASSKEY_ROW_ID, version: 1, pubkey: getPublicKey(sk) });
    expect(vault.isProtected()).toBe(true);
    expect(vault.isUnlocked()).toBe(true);
    await expect(vault.withUnlockedKey((k) => Array.from(k))).resolves.toEqual(Array.from(sk));
  });

  it("[鍵を失わない条件1] create の PRF は使わず、get の PRF(同じ credentialId・同じ salt)で暗号化する", async () => {
    const createPrf = crypto.getRandomValues(new Uint8Array(32));
    const getPrf = crypto.getRandomValues(new Uint8Array(32));
    const { db, localVault, creds, vault } = await setup({ createPrf, getPrf });
    const sk = generateSecretKey();
    await localVault.importPrivateKey(sk);

    await vault.enroll();

    // get は 1 回だけ、作成した credentialId に対して呼ばれる
    expect(creds.getCalls).toHaveLength(1);
    expect(creds.getCalls[0].allowCredentials).toHaveLength(1);
    // create と get の salt(prf.eval.first)は同じ
    const createSalt = new Uint8Array(
      (creds.createCalls[0].extensions as { prf: { eval: { first: ArrayBuffer } } }).prf.eval.first,
    );
    const getSalt = new Uint8Array(
      (creds.getCalls[0].extensions as { prf: { eval: { first: ArrayBuffer } } }).prf.eval.first,
    );
    expect(getSalt).toEqual(createSalt);

    // 実際に暗号化に使われたのは get の PRF（create の PRF では復号できない）
    const row = await rowOf(db);
    const keyFromGet = await crypto.subtle.importKey("raw", getPrf, { name: "AES-GCM" }, false, ["decrypt"]);
    const decrypted = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: row.iv }, keyFromGet, row.ct),
    );
    expect(decrypted).toEqual(sk);
    const keyFromCreate = await crypto.subtle.importKey("raw", createPrf, { name: "AES-GCM" }, false, [
      "decrypt",
    ]);
    await expect(
      crypto.subtle.decrypt({ name: "AES-GCM", iv: row.iv }, keyFromCreate, row.ct),
    ).rejects.toThrow();
  });

  it("PRF の結果が無ければ登録しない（local 行は残る）", async () => {
    const { db, localVault, vault } = await setup({ getPrf: null });
    await localVault.importPrivateKey(generateSecretKey());

    expect(await vault.enroll()).toBeNull();

    expect(await db.vault.get(PASSKEY_ROW_ID)).toBeUndefined();
    expect(await db.vault.get(VAULT_ROW_ID)).toBeDefined();
    expect(vault.isProtected()).toBe(false);
  });

  it("パスキー作成をキャンセルしたら登録しない（local 行は残る）", async () => {
    const { db, localVault, vault } = await setup({ failCreate: true });
    await localVault.importPrivateKey(generateSecretKey());

    expect(await vault.enroll()).toBeNull();

    expect(await db.vault.get(PASSKEY_ROW_ID)).toBeUndefined();
    expect(await db.vault.get(VAULT_ROW_ID)).toBeDefined();
  });

  it("local 行が無ければ登録しない", async () => {
    const { vault } = await setup();
    expect(await vault.enroll()).toBeNull();
  });

  it("[鍵を失わない条件2] 読み戻した復号結果が元の nsec と一致しなければ passkey 行を消し、local 行を残す", async () => {
    const { db, localVault } = await setup();
    const sk = generateSecretKey();
    await localVault.importPrivateKey(sk);
    // 読み戻しの decrypt だけ失敗させる（保存(encrypt)は成功させる）
    const realSubtle = crypto.subtle;
    let decryptCalls = 0;
    const brokenSubtle = {
      importKey: realSubtle.importKey.bind(realSubtle),
      encrypt: realSubtle.encrypt.bind(realSubtle),
      decrypt: async () => {
        decryptCalls++;
        throw new Error("read-back decrypt failed");
      },
    } as unknown as SubtleCrypto;
    const brokenVault = createPasskeyVault({
      database: async () => db,
      localVault: () => localVault,
      credentials: () => fakeCredentials(),
      subtle: () => brokenSubtle,
      rpId: () => "test.example",
    });

    expect(await brokenVault.enroll()).toBeNull();

    expect(decryptCalls).toBeGreaterThan(0);
    expect(await db.vault.get(PASSKEY_ROW_ID)).toBeUndefined();
    expect(await db.vault.get(VAULT_ROW_ID)).toBeDefined();
    expect(brokenVault.isProtected()).toBe(false);
    expect(brokenVault.isUnlocked()).toBe(false);
  });
});

describe("unlock", () => {
  it("成功すると公開鍵を返し、withUnlockedKey で元の秘密鍵を使える", async () => {
    const { localVault, vault } = await setup();
    const sk = generateSecretKey();
    await localVault.importPrivateKey(sk);
    await vault.enroll();

    expect(await vault.unlock()).toBe(getPublicKey(sk));
    await expect(vault.withUnlockedKey((k) => Array.from(k))).resolves.toEqual(Array.from(sk));
    expect(vault.isUnlocked()).toBe(true);
  });

  it("passkey 行が無ければ null", async () => {
    const { vault } = await setup();
    expect(await vault.unlock()).toBeNull();
  });

  it("PRF が取れなければ null（未解錠のまま）", async () => {
    const { localVault, db } = await setup();
    const sk = generateSecretKey();
    await localVault.importPrivateKey(sk);
    const enrollVault = createPasskeyVault({
      database: async () => db,
      localVault: () => localVault,
      credentials: () => fakeCredentials(),
      rpId: () => "test.example",
    });
    await enrollVault.enroll();
    const lockedVault = createPasskeyVault({
      database: async () => db,
      localVault: () => localVault,
      credentials: () => fakeCredentials({ getPrf: null }),
      rpId: () => "test.example",
    });

    expect(await lockedVault.unlock()).toBeNull();
    expect(lockedVault.isUnlocked()).toBe(false);
  });

  it("暗号文が壊れていれば復号できず null", async () => {
    const { db, localVault } = await setup();
    const sk = generateSecretKey();
    await localVault.importPrivateKey(sk);
    const creds = fakeCredentials();
    const enrollVault = createPasskeyVault({
      database: async () => db,
      localVault: () => localVault,
      credentials: () => creds,
      rpId: () => "test.example",
    });
    await enrollVault.enroll();
    const row = await rowOf(db);
    row.ct[0] ^= 1;
    await db.vault.put(row);
    const lockedVault = createPasskeyVault({
      database: async () => db,
      localVault: () => localVault,
      credentials: () => creds,
      rpId: () => "test.example",
    });

    expect(await lockedVault.unlock()).toBeNull();
  });
});

describe("unprotect", () => {
  it("[鍵を失わない条件3] 解錠済みから: local 行を書き戻し、読み戻して一致を確認してから passkey 行を消す", async () => {
    const { db, localVault, vault } = await setup();
    const sk = generateSecretKey();
    await localVault.importPrivateKey(sk);
    await vault.enroll(); // enroll 直後は解錠済み

    expect(await vault.unprotect()).toBe(true);

    expect(await db.vault.get(PASSKEY_ROW_ID)).toBeUndefined();
    const restored = await localVault.storedPubkey();
    expect(restored).toBe(getPublicKey(sk));
    await expect(localVault.withPrivateKey((k) => Array.from(k))).resolves.toEqual(Array.from(sk));
    expect(vault.isProtected()).toBe(false);
    expect(vault.isUnlocked()).toBe(false);
  });

  it("未解錠からでも内部で解錠してから同じ手順で処理する", async () => {
    const { db, localVault } = await setup();
    const sk = generateSecretKey();
    await localVault.importPrivateKey(sk);
    const creds = fakeCredentials();
    const enrollVault = createPasskeyVault({
      database: async () => db,
      localVault: () => localVault,
      credentials: () => creds,
      rpId: () => "test.example",
    });
    await enrollVault.enroll();
    // 起動し直した想定の未解錠インスタンス（同じ passkey なので同じ PRF が返る fakeCredentials を共有）
    const lockedVault = createPasskeyVault({
      database: async () => db,
      localVault: () => localVault,
      credentials: () => creds,
      rpId: () => "test.example",
    });
    expect(lockedVault.isUnlocked()).toBe(false);

    expect(await lockedVault.unprotect()).toBe(true);

    expect(await db.vault.get(PASSKEY_ROW_ID)).toBeUndefined();
    expect(await localVault.storedPubkey()).toBe(getPublicKey(sk));
  });

  it("解錠に失敗したら local 行を書かず、passkey 行を残す", async () => {
    const db = await openDb();
    const localVault = createKeyVault({ database: async () => db });
    await localVault.importPrivateKey(generateSecretKey());
    // 一旦成功する fake で enroll してから、get が失敗する vault で unprotect する
    const enrollVault = createPasskeyVault({
      database: async () => db,
      localVault: () => localVault,
      credentials: () => fakeCredentials(),
      rpId: () => "test.example",
    });
    await enrollVault.enroll();
    const lockedVault = createPasskeyVault({
      database: async () => db,
      localVault: () => localVault,
      credentials: () => fakeCredentials({ failGet: true }),
      rpId: () => "test.example",
    });

    expect(await lockedVault.unprotect()).toBe(false);

    expect(await db.vault.get(PASSKEY_ROW_ID)).toBeDefined();
    expect(await db.vault.get(VAULT_ROW_ID)).toBeUndefined();
  });

  it("[鍵を失わない条件3] 読み戻した local 行が一致しなければ local 行を消し、passkey 行を残す", async () => {
    const db = await openDb();
    const realLocalVault = createKeyVault({ database: async () => db });
    const sk = generateSecretKey();
    await realLocalVault.importPrivateKey(sk);
    // 同じ fake を使い回す（credentialId ごとに一貫した PRF を返すので、別インスタンスでも解錠できる）
    const creds = fakeCredentials();
    const enrollVault = createPasskeyVault({
      database: async () => db,
      localVault: () => realLocalVault,
      credentials: () => creds,
      rpId: () => "test.example",
    });
    await enrollVault.enroll();

    // 書き戻した local 行の読み出しだけ壊れている体の local vault（fn には常に別の鍵を渡す）
    const brokenLocalVault: KeyVault = {
      storedPubkey: () => realLocalVault.storedPubkey(),
      importPrivateKey: (key) => realLocalVault.importPrivateKey(key),
      generate: () => realLocalVault.generate(),
      withPrivateKey: (fn) => Promise.resolve(fn(new Uint8Array(32).fill(9))),
      clear: () => realLocalVault.clear(),
    };
    const unprotectVault = createPasskeyVault({
      database: async () => db,
      localVault: () => brokenLocalVault,
      credentials: () => creds,
      rpId: () => "test.example",
    });

    expect(await unprotectVault.unprotect()).toBe(false);

    expect(await db.vault.get(PASSKEY_ROW_ID)).toBeDefined();
    expect(await db.vault.get(VAULT_ROW_ID)).toBeUndefined();
  });
});

describe("clear", () => {
  it("passkey 行を消し、保護中・解錠済みの状態も破棄する", async () => {
    const { db, localVault, vault } = await setup();
    await localVault.importPrivateKey(generateSecretKey());
    await vault.enroll();
    expect(vault.isProtected()).toBe(true);

    await vault.clear();

    expect(await db.vault.get(PASSKEY_ROW_ID)).toBeUndefined();
    expect(vault.isProtected()).toBe(false);
    expect(vault.isUnlocked()).toBe(false);
    await expect(vault.withUnlockedKey(() => 0)).rejects.toMatchObject({
      name: "VaultError",
      reason: "missing",
    });
  });
});

describe("withUnlockedKey", () => {
  it("未解錠なら VaultError(missing)", async () => {
    const { vault } = await setup();
    await expect(vault.withUnlockedKey(() => 0)).rejects.toMatchObject({
      name: "VaultError",
      reason: "missing",
    });
  });
});

describe("asKeyVault", () => {
  it("withPrivateKey が withUnlockedKey に委譲される", async () => {
    const { localVault, vault } = await setup();
    const sk = generateSecretKey();
    await localVault.importPrivateKey(sk);
    await vault.enroll();
    const asVault = vault.asKeyVault();

    await expect(asVault.withPrivateKey((k) => Array.from(k))).resolves.toEqual(Array.from(sk));
    await expect(asVault.importPrivateKey(sk)).rejects.toMatchObject({ reason: "unavailable" });
  });
});

describe("isPasskeySupported", () => {
  it("PublicKeyCredential が無ければ false", async () => {
    expect(await isPasskeySupported(undefined)).toBe(false);
  });

  it("getClientCapabilities が extension:prf を返せばそれに従う", async () => {
    expect(await isPasskeySupported({ getClientCapabilities: async () => ({ "extension:prf": true }) })).toBe(
      true,
    );
    expect(
      await isPasskeySupported({ getClientCapabilities: async () => ({ "extension:prf": false }) }),
    ).toBe(false);
  });

  it("getClientCapabilities が無ければ判定できないので true", async () => {
    expect(await isPasskeySupported({})).toBe(true);
  });

  it("getClientCapabilities が例外を投げても true", async () => {
    expect(
      await isPasskeySupported({
        getClientCapabilities: async () => {
          throw new Error("boom");
        },
      }),
    ).toBe(true);
  });
});
