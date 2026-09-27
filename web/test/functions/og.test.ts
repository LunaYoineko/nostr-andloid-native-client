import { createPagesEventContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest as og } from "../../functions/api/og";
import type { Env } from "../../server/env";

const ORIGIN = "https://nostrism.shino3.net";
const SAME_ORIGIN = { "Sec-Fetch-Site": "same-origin" };
/** アプリの EventRepository.OGP_UA と同じ値であること。 */
const OGP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const PAGE = "https://example.com/page";
const AMAZON = "https://www.amazon.co.jp/dp/B000000000";
const SHORT = "https://amzn.to/abc";
const HOP0 = "https://a.example/start";
/** テストで /api/og に渡す対象 URL（キャッシュは各テストの前に消す）。 */
const TARGETS = [PAGE, AMAZON, SHORT, HOP0];
// Pages Functions が受け取る型（cf プロパティ付き）
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

const ogUrl = (target: string) => `${ORIGIN}/api/og?url=${encodeURIComponent(target)}`;

/** og.ts のキャッシュキーと同じ組み立て（自オリジンの /api/og?url=<正規化 URL>）。 */
function cacheKeyOf(target: string): string {
  const url = new URL(target);
  url.hash = "";
  const key = new URL("/api/og", ORIGIN);
  key.searchParams.set("url", url.href);
  return key.href;
}

async function call(url: string, init: RequestInit<IncomingRequestCfProperties> = {}): Promise<Response> {
  const handler: PagesFunction<Env> = og;
  const request = new IncomingRequest(url, init);
  const ctx = createPagesEventContext<typeof handler>({ request, params: {}, data: {} });
  const response = await handler(ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

type Upstream = Response | (() => Response | Promise<Response>);

/** upstream を URL ごとに返す fetch のモック。登録の無い URL は 404。 */
function mockUpstream(routes: Record<string, Upstream>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const route = routes[String(input)];
    if (route === undefined) return new Response("not found", { status: 404 });
    return typeof route === "function" ? route() : route.clone();
  });
}

const html = (body: string | ReadableStream<Uint8Array>, contentType = "text/html; charset=utf-8") =>
  new Response(body, { headers: { "Content-Type": contentType } });

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { Location: location } });

/** 終わらない HTML 本文（打ち切らなければ読み終わらない）。 */
function endlessHtml(): Response {
  const chunk = new TextEncoder().encode("a".repeat(16 * 1024));
  return html(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
    }),
  );
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: code });
}

beforeEach(async () => {
  await Promise.all(TARGETS.map((target) => caches.default.delete(cacheKeyOf(target))));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/og", () => {
  it("同一オリジンなら HTML 先頭を text/plain でそのまま返す", async () => {
    const body = '<html><head><meta property="og:title" content="t"></head></html>';
    const fetchSpy = mockUpstream({ [PAGE]: html(body) });
    const response = await call(ogUrl(PAGE), { headers: SAME_ORIGIN });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Og-Final-Url")).toBe(PAGE);
    expect(await response.text()).toBe(body);

    // 新規 Request で、UA・Accept・Accept-Language だけを付けて取りに行く
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [input, init] = fetchSpy.mock.calls[0];
    expect(String(input)).toBe(PAGE);
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("manual");
    const sent = new Headers(init?.headers);
    expect([...sent.keys()].sort()).toEqual(["accept", "accept-language", "user-agent"]);
    expect(sent.get("User-Agent")).toBe(OGP_UA);
    expect(sent.get("Accept")).toBe("text/html,application/xhtml+xml");
    expect(sent.get("Accept-Language")).toBe("ja,en;q=0.8");
  });

  it("文字コードを変換せずにバイト列のまま返す", async () => {
    const sjis = new Uint8Array([0x3c, 0x74, 0x3e, 0x82, 0xa0, 0x3c, 0x2f, 0x74, 0x3e]); // <t>あ</t>（Shift_JIS）
    mockUpstream({ [PAGE]: html(new Blob([sjis]).stream(), "text/html; charset=Shift_JIS") });
    const response = await call(ogUrl(PAGE), { headers: SAME_ORIGIN });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(sjis);
  });

  it("upstream の Content-Type（charset 付き）を X-Og-Upstream-Content-Type でそのまま渡す（キャッシュからも）", async () => {
    const fetchSpy = mockUpstream({ [PAGE]: html("<html></html>", "text/html; charset=Shift_JIS") });
    const response = await call(ogUrl(PAGE), { headers: SAME_ORIGIN });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("X-Og-Upstream-Content-Type")).toBe("text/html; charset=Shift_JIS");

    const second = await call(ogUrl(PAGE), { headers: SAME_ORIGIN });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second.headers.get("X-Og-Upstream-Content-Type")).toBe("text/html; charset=Shift_JIS");
  });

  it("upstream の Content-Type が charset 無しならその値のまま渡す", async () => {
    mockUpstream({ [PAGE]: html("<html></html>", "text/html") });
    const response = await call(ogUrl(PAGE), { headers: SAME_ORIGIN });
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Og-Upstream-Content-Type")).toBe("text/html");
  });

  it("application/xhtml+xml も受け付ける", async () => {
    mockUpstream({ [PAGE]: html("<html/>", "application/xhtml+xml") });
    const response = await call(ogUrl(PAGE), { headers: SAME_ORIGIN });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html/>");
  });

  it("Origin が同一ホストなら許可、クライアントの Cookie/Authorization は転送しない", async () => {
    const fetchSpy = mockUpstream({ [PAGE]: html("<html></html>") });
    const response = await call(ogUrl(PAGE), {
      headers: { Origin: ORIGIN, Cookie: "a=b", Authorization: "Bearer x" },
    });
    expect(response.status).toBe(200);
    const sent = new Headers(fetchSpy.mock.calls[0][1]?.headers);
    expect(sent.has("Cookie")).toBe(false);
    expect(sent.has("Authorization")).toBe(false);
  });

  it("同一オリジン以外は 403", async () => {
    const fetchSpy = mockUpstream({ [PAGE]: html("<html></html>") });
    await expectError(await call(ogUrl(PAGE)), 403, "forbidden");
    await expectError(
      await call(ogUrl(PAGE), { headers: { Origin: "https://evil.example" } }),
      403,
      "forbidden",
    );
    await expectError(
      await call(ogUrl(PAGE), { headers: { "Sec-Fetch-Site": "cross-site" } }),
      403,
      "forbidden",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POST は 405（Allow: GET）", async () => {
    const fetchSpy = mockUpstream({ [PAGE]: html("<html></html>") });
    const response = await call(ogUrl(PAGE), { method: "POST", headers: SAME_ORIGIN, body: "x" });
    expect(response.headers.get("Allow")).toBe("GET");
    await expectError(response, 405, "method_not_allowed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("url が無い・URL でなければ 400", async () => {
    const fetchSpy = mockUpstream({});
    await expectError(await call(`${ORIGIN}/api/og`, { headers: SAME_ORIGIN }), 400, "invalid_url");
    await expectError(await call(`${ORIGIN}/api/og?url=`, { headers: SAME_ORIGIN }), 400, "invalid_url");
    await expectError(await call(ogUrl("not a url"), { headers: SAME_ORIGIN }), 400, "invalid_url");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    "http://example.com/",
    "https://127.0.0.1/",
    "https://10.0.0.1/",
    "https://[::1]/",
    "https://localhost/",
    "https://metadata.internal/",
    "https://example.com:8443/",
    "https://user:pass@example.com/",
    `${ORIGIN}/app/`,
  ])("内部アドレス・http・IP リテラル等は 400: %s", async (target) => {
    const fetchSpy = mockUpstream({});
    await expectError(await call(ogUrl(target), { headers: SAME_ORIGIN }), 400, "invalid_url");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(["application/json", "image/png", "text/plain", ""])(
    "HTML 以外の Content-Type は 415: %s",
    async (contentType) => {
      mockUpstream({
        [PAGE]: new Response("x", { headers: contentType ? { "Content-Type": contentType } : {} }),
      });
      await expectError(await call(ogUrl(PAGE), { headers: SAME_ORIGIN }), 415, "upstream_content_type");
    },
  );

  it("本文は先頭 200KB（200,000 バイト）で打ち切る", async () => {
    const body = "<html>".padEnd(300_000, "x");
    mockUpstream({ [PAGE]: html(body) });
    const response = await call(ogUrl(PAGE), { headers: SAME_ORIGIN });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text.length).toBe(200_000);
    expect(text).toBe(body.slice(0, 200_000));
  });

  it("終わらない本文も上限で読むのをやめる", async () => {
    mockUpstream({ [PAGE]: endlessHtml });
    const response = await call(ogUrl(PAGE), { headers: SAME_ORIGIN });
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(200_000);
  });

  it("上限以下の本文はそのまま全部返す", async () => {
    const body = "y".repeat(200_000);
    mockUpstream({ [PAGE]: html(body) });
    expect(await (await call(ogUrl(PAGE), { headers: SAME_ORIGIN })).text()).toBe(body);
  });

  it("Amazon は 512KB（512,000 バイト）まで読む", async () => {
    mockUpstream({ [AMAZON]: endlessHtml });
    const response = await call(ogUrl(AMAZON), { headers: SAME_ORIGIN });
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(512_000);
  });

  it("短縮 URL から Amazon へリダイレクトした場合も最終ホストで 512KB", async () => {
    mockUpstream({ [SHORT]: redirect(AMAZON, 301), [AMAZON]: endlessHtml });
    const response = await call(ogUrl(SHORT), { headers: SAME_ORIGIN });
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Og-Final-Url")).toBe(AMAZON);
    expect((await response.arrayBuffer()).byteLength).toBe(512_000);
  });

  it("リダイレクトは 3 ホップまで追い、各ホップも manual で取りに行く（相対 Location も解決）", async () => {
    const fetchSpy = mockUpstream({
      [HOP0]: redirect("https://b.example/1", 301),
      "https://b.example/1": redirect("/2", 307),
      "https://b.example/2": redirect("https://c.example/3#frag", 308),
      "https://c.example/3": html("<title>final</title>"),
    });
    const response = await call(ogUrl(HOP0), { headers: SAME_ORIGIN });

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Og-Final-Url")).toBe("https://c.example/3");
    expect(await response.text()).toBe("<title>final</title>");
    expect(fetchSpy.mock.calls.map(([input]) => String(input))).toEqual([
      HOP0,
      "https://b.example/1",
      "https://b.example/2",
      "https://c.example/3",
    ]);
    for (const [, init] of fetchSpy.mock.calls) {
      expect(init?.redirect).toBe("manual");
      expect([...new Headers(init?.headers).keys()].sort()).toEqual([
        "accept",
        "accept-language",
        "user-agent",
      ]);
    }
  });

  it("4 ホップ目のリダイレクトは 502", async () => {
    const fetchSpy = mockUpstream({
      [HOP0]: redirect("https://b.example/1"),
      "https://b.example/1": redirect("https://b.example/2"),
      "https://b.example/2": redirect("https://b.example/3"),
      "https://b.example/3": redirect("https://b.example/4"),
      "https://b.example/4": html("<html></html>"),
    });
    await expectError(await call(ogUrl(HOP0), { headers: SAME_ORIGIN }), 502, "upstream_redirect");
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it.each([
    "https://10.0.0.1/",
    "https://169.254.169.254/latest/meta-data/",
    "http://example.com/",
    "https://localhost/",
    `${ORIGIN}/api/og?url=x`,
  ])("リダイレクト先が不正（%s）なら取りに行かず 502", async (location) => {
    const fetchSpy = mockUpstream({ [HOP0]: redirect(location) });
    await expectError(await call(ogUrl(HOP0), { headers: SAME_ORIGIN }), 502, "upstream_redirect");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("Location の無いリダイレクトは 502", async () => {
    mockUpstream({ [HOP0]: new Response(null, { status: 302 }) });
    await expectError(await call(ogUrl(HOP0), { headers: SAME_ORIGIN }), 502, "upstream_redirect");
  });

  it.each([404, 500, 304])("upstream の %i は 502", async (status) => {
    mockUpstream({ [PAGE]: new Response(null, { status, headers: { "Content-Type": "text/html" } }) });
    await expectError(await call(ogUrl(PAGE), { headers: SAME_ORIGIN }), 502, "upstream_status");
  });

  it("接続できなければ 502", async () => {
    mockUpstream({ [PAGE]: () => Promise.reject(new TypeError("Network connection lost.")) });
    await expectError(await call(ogUrl(PAGE), { headers: SAME_ORIGIN }), 502, "upstream_unreachable");
  });

  it("タイムアウトは 504", async () => {
    mockUpstream({
      [PAGE]: () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")),
    });
    await expectError(await call(ogUrl(PAGE), { headers: SAME_ORIGIN }), 504, "upstream_timeout");
  });

  it("本文の読み取り中のタイムアウトも 504", async () => {
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<html>"));
      },
      pull(controller) {
        controller.error(new DOMException("The operation timed out.", "TimeoutError"));
      },
    });
    mockUpstream({ [PAGE]: () => html(stalled) });
    await expectError(await call(ogUrl(PAGE), { headers: SAME_ORIGIN }), 504, "upstream_timeout");
  });

  it("2 回目は 24 時間キャッシュから返す（fragment 違いも同じキー、クライアントへは no-store）", async () => {
    const fetchSpy = mockUpstream({ [PAGE]: html("<title>cached</title>") });
    await call(ogUrl(`${PAGE}#a`), { headers: SAME_ORIGIN });
    const second = await call(ogUrl(`${PAGE}#b`), { headers: SAME_ORIGIN });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(PAGE);
    expect(second.status).toBe(200);
    expect(second.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(second.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(second.headers.get("Cache-Control")).toBe("no-store");
    expect(second.headers.get("X-Og-Final-Url")).toBe(PAGE);
    expect(await second.text()).toBe("<title>cached</title>");

    const stored = await caches.default.match(cacheKeyOf(PAGE));
    expect(stored?.headers.get("Cache-Control")).toBe("max-age=86400");
  });

  it("リダイレクト後の最終 URL もキャッシュから返す", async () => {
    const fetchSpy = mockUpstream({
      [HOP0]: redirect("https://b.example/final"),
      "https://b.example/final": html("<html></html>"),
    });
    await call(ogUrl(HOP0), { headers: SAME_ORIGIN });
    const second = await call(ogUrl(HOP0), { headers: SAME_ORIGIN });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(second.headers.get("X-Og-Final-Url")).toBe("https://b.example/final");
  });

  it("失敗は 10 分のネガティブキャッシュ（同じステータスで返し、upstream へは行かない）", async () => {
    const fetchSpy = mockUpstream({ [PAGE]: new Response("oops", { status: 500 }) });
    await expectError(await call(ogUrl(PAGE), { headers: SAME_ORIGIN }), 502, "upstream_status");
    fetchSpy.mockImplementation(async () => html("<html></html>"));
    await expectError(await call(ogUrl(PAGE), { headers: SAME_ORIGIN }), 502, "upstream_status");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const stored = await caches.default.match(cacheKeyOf(PAGE));
    expect(stored?.headers.get("Cache-Control")).toBe("max-age=600");
  });

  it("タイムアウトと 415 もネガティブキャッシュする", async () => {
    const fetchSpy = mockUpstream({
      [PAGE]: () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")),
      [AMAZON]: new Response("{}", { headers: { "Content-Type": "application/json" } }),
    });
    await call(ogUrl(PAGE), { headers: SAME_ORIGIN });
    await call(ogUrl(AMAZON), { headers: SAME_ORIGIN });
    await expectError(await call(ogUrl(PAGE), { headers: SAME_ORIGIN }), 504, "upstream_timeout");
    await expectError(await call(ogUrl(AMAZON), { headers: SAME_ORIGIN }), 415, "upstream_content_type");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("入力の検証エラー（400）はキャッシュしない", async () => {
    mockUpstream({});
    await call(ogUrl("https://10.0.0.1/"), { headers: SAME_ORIGIN });
    expect(await caches.default.match(cacheKeyOf("https://10.0.0.1/"))).toBeUndefined();
  });

  it("キャッシュキーは対象 URL そのものではない（他の /api/* の upstream キーと衝突しない）", async () => {
    mockUpstream({ [PAGE]: new Response("oops", { status: 500 }) });
    await call(ogUrl(PAGE), { headers: SAME_ORIGIN });
    expect(await caches.default.match(PAGE)).toBeUndefined();
    expect(await caches.default.match(cacheKeyOf(PAGE))).toBeDefined();
  });
});
