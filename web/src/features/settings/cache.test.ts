import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { expect, it } from "vitest";
import { createDatabase, DB_NAME } from "../../db/schema";
import { createVaultDatabase, VAULT_DB_NAME } from "../../signer/webKeyVault";
import { clearCache } from "./cache";

it("キャッシュの DB（nostrism）だけを消し、鍵の DB（nostrism-vault）は中身ごと残す", async () => {
  const indexedDB = new IDBFactory();
  const cache = createDatabase({ indexedDB, IDBKeyRange });
  await cache.open();
  await cache.ogpCache.put({ url: "https://example.com/", fetchedAt: 1, ok: false });
  const vault = createVaultDatabase({ indexedDB, IDBKeyRange });
  await vault.open();
  await vault.vault.put({ id: "local", pubkey: "p" });

  // アプリの接続（cache）は開いたままでも消せる
  await clearCache({ indexedDB, IDBKeyRange });

  const names = (await indexedDB.databases()).map((d) => d.name);
  expect(names).toContain(VAULT_DB_NAME);
  expect(names).not.toContain(DB_NAME);
  expect(await vault.vault.get("local")).toMatchObject({ id: "local", pubkey: "p" });
  vault.close();
});
