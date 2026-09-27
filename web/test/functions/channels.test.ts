import { createPagesEventContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest as apiNotFound } from "../../functions/api/[[path]]";
import { onRequest as nchanChannels } from "../../functions/api/nchan/channels";
import type { Env } from "../../server/env";

const NCHAN_CHANNELS_UPSTREAM = "https://thread.nchan.vip/channels";
const ORIGIN = "https://nostrism.shino3.net";
const CHANNELS = `${ORIGIN}/api/nchan/channels`;
const SAME_ORIGIN = { "Sec-Fetch-Site": "same-origin" };
// Pages Functions が受け取る型（cf プロパティ付き）
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

async function call(
  url: string,
  init: RequestInit<IncomingRequestCfProperties> = {},
  handler: PagesFunction<Env> = nchanChannels,
): Promise<Response> {
  const request = new IncomingRequest(url, init);
  const ctx = createPagesEventContext<typeof handler>({ request, params: {}, data: {} });
  const response = await handler(ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function mockUpstream(response: Response | (() => Promise<Response>)) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => (typeof response === "function" ? response() : response.clone()));
}

const upstreamJson = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8" } });

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(await response.json()).toEqual({ error: code });
}

beforeEach(async () => {
  await caches.default.delete(NCHAN_CHANNELS_UPSTREAM);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/nchan/channels", () => {
  it("(a) 同一オリジンなら upstream の JSON を 200 で返す", async () => {
    const fetchSpy = mockUpstream(upstreamJson({ data: [{ id: "abc" }] }));
    const response = await call(CHANNELS, { headers: SAME_ORIGIN });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ data: [{ id: "abc" }] });

    // 固定 upstream に、UA と Accept だけを付けて取りに行く
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [input, init] = fetchSpy.mock.calls[0];
    expect(String(input)).toBe(NCHAN_CHANNELS_UPSTREAM);
    expect(init?.redirect).toBe("manual");
    const sent = new Headers(init?.headers);
    expect([...sent.keys()].sort()).toEqual(["accept", "user-agent"]);
    expect(sent.get("Accept")).toBe("application/json");
  });

  it("Origin / Referer が同一ホストなら許可、クライアントの Cookie/Authorization は転送しない", async () => {
    const fetchSpy = mockUpstream(upstreamJson({ data: [] }));
    const response = await call(CHANNELS, {
      headers: { Origin: ORIGIN, Cookie: "a=b", Authorization: "Bearer x" },
    });
    expect(response.status).toBe(200);
    const sent = new Headers(fetchSpy.mock.calls[0][1]?.headers);
    expect(sent.has("Cookie")).toBe(false);
    expect(sent.has("Authorization")).toBe(false);
  });

  it("2 回目は 60 秒キャッシュから返す（クライアントへは no-store）", async () => {
    const fetchSpy = mockUpstream(upstreamJson({ data: [1] }));
    await call(CHANNELS, { headers: SAME_ORIGIN });
    const second = await call(CHANNELS, { headers: SAME_ORIGIN });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(200);
    expect(second.headers.get("Cache-Control")).toBe("no-store");
    expect(await second.json()).toEqual({ data: [1] });
  });

  it("(b) Origin / Referer / Sec-Fetch-Site が無ければ 403", async () => {
    const fetchSpy = mockUpstream(upstreamJson({}));
    await expectError(await call(CHANNELS), 403, "forbidden");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("別オリジンの Origin は 403", async () => {
    mockUpstream(upstreamJson({}));
    await expectError(
      await call(CHANNELS, { headers: { Origin: "https://evil.example" } }),
      403,
      "forbidden",
    );
  });

  it("(c) POST は 405（Allow: GET）", async () => {
    const fetchSpy = mockUpstream(upstreamJson({}));
    const response = await call(CHANNELS, { method: "POST", headers: SAME_ORIGIN, body: "{}" });
    expect(response.headers.get("Allow")).toBe("GET");
    await expectError(response, 405, "method_not_allowed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("(d) upstream 500 は 502", async () => {
    mockUpstream(new Response("oops", { status: 500, headers: { "Content-Type": "application/json" } }));
    await expectError(await call(CHANNELS, { headers: SAME_ORIGIN }), 502, "upstream_status");
  });

  it("upstream のリダイレクトは追わずに 502", async () => {
    mockUpstream(new Response(null, { status: 302, headers: { Location: "https://evil.example/" } }));
    await expectError(await call(CHANNELS, { headers: SAME_ORIGIN }), 502, "upstream_redirect");
  });

  it("(e) 64KB を超える本文は 502", async () => {
    const big = JSON.stringify({ data: "x".repeat(64 * 1024) });
    mockUpstream(new Response(big, { headers: { "Content-Type": "application/json" } }));
    await expectError(await call(CHANNELS, { headers: SAME_ORIGIN }), 502, "upstream_too_large");
  });

  it("64KB ちょうどは通す", async () => {
    const body = JSON.stringify({ d: "" });
    const exact = body.slice(0, -2) + "x".repeat(64 * 1024 - body.length) + '"}';
    expect(exact.length).toBe(64 * 1024);
    mockUpstream(new Response(exact, { headers: { "Content-Type": "application/json" } }));
    const response = await call(CHANNELS, { headers: SAME_ORIGIN });
    expect(response.status).toBe(200);
  });

  it("(f) JSON 以外の Content-Type は 502", async () => {
    mockUpstream(new Response("<html></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } }));
    await expectError(await call(CHANNELS, { headers: SAME_ORIGIN }), 502, "upstream_content_type");
  });

  it("タイムアウトは 504", async () => {
    mockUpstream(() => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")));
    await expectError(await call(CHANNELS, { headers: SAME_ORIGIN }), 504, "upstream_timeout");
  });

  it("失敗はキャッシュしない", async () => {
    mockUpstream(new Response("oops", { status: 500 }));
    await call(CHANNELS, { headers: SAME_ORIGIN });
    expect(await caches.default.match(NCHAN_CHANNELS_UPSTREAM)).toBeUndefined();
  });
});

describe("その他の /api/*（functions/api/[[path]].ts）", () => {
  it("未知の /api パスは 404", async () => {
    const fetchSpy = mockUpstream(upstreamJson({}));
    await expectError(
      await call(`${ORIGIN}/api/unknown`, { headers: SAME_ORIGIN }, apiNotFound),
      404,
      "not_found",
    );
    await expectError(
      await call(`${ORIGIN}/api/nchan/channels/extra`, { headers: SAME_ORIGIN }, apiNotFound),
      404,
      "not_found",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
