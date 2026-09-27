import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { OGP_TTL_NG_SEC, OGP_TTL_OK_SEC } from "../../db/ogpCache";
import { createDatabase, type NostrismDb } from "../../db/schema";
import { createOgpLoader, OGP_MEMORY_MAX } from "./ogpLoader";

const NOW = 1_800_000_000;
const URL_A = "https://a.test/page?x=1&y=2";

function testDb() {
  return createDatabase({ name: `ogp-${crypto.randomUUID()}`, indexedDB: new IDBFactory(), IDBKeyRange });
}

function htmlResponse(html: string, headers: Record<string, string> = {}): Response {
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
  });
}

const OG_HTML = `<head><meta property="og:title" content="A のタイトル"><meta property="og:image" content="/og.png"></head>`;

function setup(options: { db?: NostrismDb | null; now?: number; response?: () => Promise<Response> } = {}) {
  const fetchImpl = vi.fn<typeof fetch>(
    options.response ?? (async () => htmlResponse(OG_HTML, { "X-Og-Final-Url": "https://www.a.test/final" })),
  );
  let now = options.now ?? NOW;
  const loader = createOgpLoader({ fetch: fetchImpl, db: () => options.db ?? null, now: () => now });
  return { loader, fetchImpl, setNow: (value: number) => (now = value) };
}

it("/api/og?url=<符号化した URL> を同一オリジンで取り、最終 URL を基準に解析する", async () => {
  const { loader, fetchImpl } = setup();

  await expect(loader.load(URL_A)).resolves.toEqual({
    url: URL_A,
    title: "A のタイトル",
    image: "https://www.a.test/og.png",
  });

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [input, init] = fetchImpl.mock.calls[0];
  expect(input).toBe(`/api/og?url=${encodeURIComponent(URL_A)}`);
  expect(init).toMatchObject({ credentials: "same-origin" });
});

it("同じ URL の同時の取得は 1 本にまとめ、2 回目以降はメモリから返す（peek でも読める）", async () => {
  const { loader, fetchImpl } = setup();
  expect(loader.peek(URL_A)).toBeUndefined();

  const [first, second] = await Promise.all([loader.load(URL_A), loader.load(URL_A)]);
  expect(first).toBe(second);
  await loader.load(URL_A);

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(loader.peek(URL_A)).toBe(first);
});

it("upstream の文字コードで読む（X-Og-Upstream-Content-Type の charset）", async () => {
  const sjis = new Uint8Array([
    ...Array.from("<head><title>", (c) => c.charCodeAt(0)),
    0x93,
    0xfa,
    0x96,
    0x7b,
    ...Array.from("</title></head>", (c) => c.charCodeAt(0)),
  ]);
  const { loader } = setup({
    response: async () =>
      new Response(sjis, { headers: { "X-Og-Upstream-Content-Type": "text/html; charset=Shift_JIS" } }),
  });
  await expect(loader.load(URL_A)).resolves.toEqual({ url: URL_A, title: "日本" });
});

it("エラー応答・タイトルも画像も無いページは null", async () => {
  const notFound = setup({
    response: async () => new Response('{"error":"upstream_status"}', { status: 502 }),
  });
  await expect(notFound.loader.load(URL_A)).resolves.toBeNull();

  const empty = setup({ response: async () => htmlResponse("<head></head>") });
  await expect(empty.loader.load(URL_A)).resolves.toBeNull();
  await empty.loader.load(URL_A);
  expect(empty.fetchImpl).toHaveBeenCalledTimes(1);
});

it("https 以外は取りに行かず null（/api/og が受けない）", async () => {
  const { loader, fetchImpl } = setup();
  expect(loader.peek("http://a.test/")).toBeNull();
  await expect(loader.load("http://a.test/")).resolves.toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("取得結果を DB に書き（失敗は ok: false）、TTL 内なら次の起動でも取りに行かない", async () => {
  const db = testDb();
  const first = setup({ db });
  await first.loader.load(URL_A);
  await vi.waitFor(async () => expect(await db.ogpCache.get(URL_A)).toBeDefined());
  expect(await db.ogpCache.get(URL_A)).toEqual({
    url: URL_A,
    fetchedAt: NOW,
    ok: true,
    title: "A のタイトル",
    image: "https://www.a.test/og.png",
  });

  // 別の取得口（= 再読み込み後）。TTL の 7 日以内は DB から
  const again = setup({ db, now: NOW + OGP_TTL_OK_SEC - 1 });
  await expect(again.loader.load(URL_A)).resolves.toEqual({
    url: URL_A,
    title: "A のタイトル",
    image: "https://www.a.test/og.png",
  });
  expect(again.fetchImpl).not.toHaveBeenCalled();

  // 7 日を過ぎたら取り直す
  const expired = setup({ db, now: NOW + OGP_TTL_OK_SEC });
  await expired.loader.load(URL_A);
  expect(expired.fetchImpl).toHaveBeenCalledTimes(1);
  db.close();
});

it("失敗は 1 日だけ DB に覚える", async () => {
  const db = testDb();
  const failing = setup({ db, response: async () => new Response("{}", { status: 504 }) });
  await failing.loader.load(URL_A);
  await vi.waitFor(async () =>
    expect(await db.ogpCache.get(URL_A)).toEqual({ url: URL_A, fetchedAt: NOW, ok: false }),
  );

  const within = setup({ db, now: NOW + OGP_TTL_NG_SEC - 1 });
  await expect(within.loader.load(URL_A)).resolves.toBeNull();
  expect(within.fetchImpl).not.toHaveBeenCalled();

  const after = setup({ db, now: NOW + OGP_TTL_NG_SEC });
  await expect(after.loader.load(URL_A)).resolves.not.toBeNull();
  expect(after.fetchImpl).toHaveBeenCalledTimes(1);
  db.close();
});

it("通信できなかったときは null をメモリにだけ覚え、DB には書かない", async () => {
  const db = testDb();
  const { loader, fetchImpl } = setup({
    db,
    response: async () => {
      throw new TypeError("Failed to fetch");
    },
  });
  await expect(loader.load(URL_A)).resolves.toBeNull();
  await expect(loader.load(URL_A)).resolves.toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(await db.ogpCache.count()).toBe(0);
  db.close();
});

it("DB が読めなくても取りに行く", async () => {
  const db = testDb();
  db.close();
  const { loader, fetchImpl } = setup({ db });
  await expect(loader.load(URL_A)).resolves.toMatchObject({ title: "A のタイトル" });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it(`メモリは ${OGP_MEMORY_MAX} 件まで。超えたら最も使っていないものから忘れる`, async () => {
  const { loader, fetchImpl } = setup();
  const urls = Array.from({ length: OGP_MEMORY_MAX }, (_, i) => `https://m.test/${i}`);
  for (const url of urls) await loader.load(url);
  // 0 番を使うと、次に溢れたときは 1 番が消える
  expect(loader.peek(urls[0])).not.toBeUndefined();
  await loader.load("https://m.test/extra");

  expect(loader.peek(urls[0])).not.toBeUndefined();
  expect(loader.peek(urls[1])).toBeUndefined();
  expect(fetchImpl).toHaveBeenCalledTimes(OGP_MEMORY_MAX + 1);
});
