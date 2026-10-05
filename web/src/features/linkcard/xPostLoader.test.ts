import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { OGP_TTL_NG_SEC, OGP_TTL_OK_SEC } from "../../db/ogpCache";
import { createDatabase, type NostrismDb } from "../../db/schema";
import { createXPostDateLoader } from "./xPostLoader";

const NOW = 1_800_000_000;
const POST = "https://x.com/jack/status/20";
const HTML =
  '<blockquote><p>x</p>&mdash; jack (@jack) <a href="https://x.com/jack/status/20?ref_src=a">2026年10月4日</a></blockquote>';

function testDb() {
  return createDatabase({ name: `xp-${crypto.randomUUID()}`, indexedDB: new IDBFactory(), IDBKeyRange });
}

function setup(options: { db?: NostrismDb | null; response?: () => Promise<Response> } = {}) {
  const fetchImpl = vi.fn<typeof fetch>(
    options.response ?? (async () => Response.json({ html: HTML, type: "rich" })),
  );
  let now = NOW;
  const loader = createXPostDateLoader({ fetch: fetchImpl, db: () => options.db ?? null, now: () => now });
  return { loader, fetchImpl, setNow: (v: number) => (now = v) };
}

it("/api/oembed?url=<正規化した投稿 URL>&lang= を同一オリジンで取り、末尾のリンク文字列を日付にする", async () => {
  const { loader, fetchImpl } = setup();
  await expect(loader.load("https://twitter.com/jack/status/20?s=20", "ja")).resolves.toBe("2026年10月4日");
  expect(fetchImpl).toHaveBeenCalledWith(`/api/oembed?url=${encodeURIComponent(POST)}&lang=ja`, {
    credentials: "same-origin",
  });
});

it("メモリに覚え、同じ組の同時の取得は 1 本にまとめる。言語が違えば別", async () => {
  const { loader, fetchImpl } = setup();
  await Promise.all([loader.load(POST, "ja"), loader.load(POST, "ja")]);
  await loader.load(POST, "ja");
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(loader.peek(POST, "ja")).toBe("2026年10月4日");
  expect(loader.peek(POST, "en")).toBeUndefined();
  await loader.load(POST, "en");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it("投稿 URL でなければ取りに行かない", async () => {
  const { loader, fetchImpl } = setup();
  await expect(loader.load("https://x.com/jack", "ja")).resolves.toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("DB（ogpCache の x-oembed:<lang>:<URL>、title に日時）に書き、TTL 内なら通信しない。成功 7 日・失敗 1 日", async () => {
  const db = testDb();
  const first = setup({ db });
  await first.loader.load(POST, "ja");
  await vi.waitFor(async () =>
    expect(await db.ogpCache.get(`x-oembed:ja:${POST}`)).toMatchObject({
      ok: true,
      title: "2026年10月4日",
      fetchedAt: NOW,
    }),
  );

  const second = setup({ db });
  await expect(second.loader.load(POST, "ja")).resolves.toBe("2026年10月4日");
  expect(second.fetchImpl).not.toHaveBeenCalled();

  const stale = setup({ db });
  stale.setNow(NOW + OGP_TTL_OK_SEC);
  await stale.loader.load(POST, "ja");
  expect(stale.fetchImpl).toHaveBeenCalledTimes(1);

  const failing = setup({ db: testDb(), response: async () => new Response("x", { status: 502 }) });
  await expect(failing.loader.load(POST, "ja")).resolves.toBeNull();
  expect(OGP_TTL_NG_SEC).toBeLessThan(OGP_TTL_OK_SEC);
});

it("取れない（502・JSON でない・html が無い）なら null。通信できなければ DB に残さない", async () => {
  const bad = setup({ response: async () => new Response("x", { status: 502 }) });
  await expect(bad.loader.load(POST, "ja")).resolves.toBeNull();
  const noHtml = setup({ response: async () => Response.json({ type: "rich" }) });
  await expect(noHtml.loader.load(POST, "ja")).resolves.toBeNull();

  const db = testDb();
  const offline = setup({
    db,
    response: async () => {
      throw new TypeError("offline");
    },
  });
  await expect(offline.loader.load(POST, "ja")).resolves.toBeNull();
  expect(await db.ogpCache.get(`x-oembed:ja:${POST}`)).toBeUndefined();
});
