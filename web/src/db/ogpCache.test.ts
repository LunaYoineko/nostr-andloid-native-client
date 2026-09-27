import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { expect, it } from "vitest";
import { getFreshOgp, OGP_TTL_NG_SEC, OGP_TTL_OK_SEC, putOgp } from "./ogpCache";
import { createDatabase } from "./schema";

const NOW = 1_800_000_000;

function testDb() {
  return createDatabase({ name: `ogp-${crypto.randomUUID()}`, indexedDB: new IDBFactory(), IDBKeyRange });
}

it("TTL はネイティブと同じ成功 7 日・失敗 1 日", () => {
  expect(OGP_TTL_OK_SEC).toBe(7 * 24 * 3600);
  expect(OGP_TTL_NG_SEC).toBe(24 * 3600);
});

it("成功は 7 日未満、失敗は 1 日未満の行だけを返す。無ければ undefined", async () => {
  const db = testDb();
  await putOgp(db, { url: "https://ok.test/", fetchedAt: NOW, ok: true, title: "t", siteName: "s" });
  await putOgp(db, { url: "https://ng.test/", fetchedAt: NOW, ok: false });

  expect(await getFreshOgp(db, "https://ok.test/", NOW + OGP_TTL_OK_SEC - 1)).toEqual({
    url: "https://ok.test/",
    fetchedAt: NOW,
    ok: true,
    title: "t",
    siteName: "s",
  });
  expect(await getFreshOgp(db, "https://ok.test/", NOW + OGP_TTL_OK_SEC)).toBeUndefined();
  expect(await getFreshOgp(db, "https://ng.test/", NOW + OGP_TTL_NG_SEC - 1)).toMatchObject({ ok: false });
  expect(await getFreshOgp(db, "https://ng.test/", NOW + OGP_TTL_NG_SEC)).toBeUndefined();
  expect(await getFreshOgp(db, "https://none.test/", NOW)).toBeUndefined();
  db.close();
});

it("同じ URL は上書きする", async () => {
  const db = testDb();
  await putOgp(db, { url: "https://a.test/", fetchedAt: NOW, ok: false });
  await putOgp(db, { url: "https://a.test/", fetchedAt: NOW + 10, ok: true, title: "新" });
  expect(await db.ogpCache.count()).toBe(1);
  expect(await getFreshOgp(db, "https://a.test/", NOW + 10)).toMatchObject({ ok: true, title: "新" });
  db.close();
});
