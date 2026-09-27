import { createPagesEventContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest as oembed } from "../../functions/api/oembed";
import type { Env } from "../../server/env";

const ORIGIN = "https://nostrism.shino3.net";
const SAME_ORIGIN = { "Sec-Fetch-Site": "same-origin" };
const VIDEO_ID = "dQw4w9WgXcQ";
const UPSTREAM = `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${VIDEO_ID}&format=json`;
const OEMBED = `${ORIGIN}/api/oembed?v=${VIDEO_ID}`;
// Pages Functions が受け取る型（cf プロパティ付き）
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

async function call(url: string, init: RequestInit<IncomingRequestCfProperties> = {}): Promise<Response> {
  const handler: PagesFunction<Env> = oembed;
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

const OEMBED_BODY = { title: "Never Gonna Give You Up", author_name: "Rick Astley", type: "video" };

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(await response.json()).toEqual({ error: code });
}

beforeEach(async () => {
  await caches.default.delete(UPSTREAM);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/oembed", () => {
  it("同一オリジンなら固定 upstream の JSON を 200 で返す", async () => {
    const fetchSpy = mockUpstream(upstreamJson(OEMBED_BODY));
    const response = await call(OEMBED, { headers: SAME_ORIGIN });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(OEMBED_BODY);

    // videoId だけを埋めた固定 URL に、UA と Accept だけを付けて取りに行く
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [input, init] = fetchSpy.mock.calls[0];
    expect(String(input)).toBe(UPSTREAM);
    expect(init?.redirect).toBe("manual");
    const sent = new Headers(init?.headers);
    expect([...sent.keys()].sort()).toEqual(["accept", "user-agent"]);
    expect(sent.get("Accept")).toBe("application/json");
  });

  it("クライアントの Cookie/Authorization は転送しない", async () => {
    const fetchSpy = mockUpstream(upstreamJson(OEMBED_BODY));
    const response = await call(OEMBED, {
      headers: { Origin: ORIGIN, Cookie: "a=b", Authorization: "Bearer x" },
    });
    expect(response.status).toBe(200);
    const sent = new Headers(fetchSpy.mock.calls[0][1]?.headers);
    expect(sent.has("Cookie")).toBe(false);
    expect(sent.has("Authorization")).toBe(false);
  });

  it.each([
    ["無し", `${ORIGIN}/api/oembed`],
    ["空", `${ORIGIN}/api/oembed?v=`],
    ["短い", `${ORIGIN}/api/oembed?v=bad`],
    ["12 文字", `${ORIGIN}/api/oembed?v=${VIDEO_ID}x`],
    ["記号", `${ORIGIN}/api/oembed?v=dQw4w9WgX.Q`],
    ["URL", `${ORIGIN}/api/oembed?v=${encodeURIComponent("https://a.b")}`],
    ["パラメータ注入", `${ORIGIN}/api/oembed?v=${encodeURIComponent("a&format=x")}`],
  ])("不正な videoId（%s）は 400", async (_, url) => {
    const fetchSpy = mockUpstream(upstreamJson(OEMBED_BODY));
    await expectError(await call(url, { headers: SAME_ORIGIN }), 400, "invalid_video_id");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("同一オリジン以外は 403", async () => {
    const fetchSpy = mockUpstream(upstreamJson(OEMBED_BODY));
    await expectError(await call(OEMBED), 403, "forbidden");
    await expectError(await call(OEMBED, { headers: { Origin: "https://evil.example" } }), 403, "forbidden");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POST は 405（Allow: GET）", async () => {
    const fetchSpy = mockUpstream(upstreamJson(OEMBED_BODY));
    const response = await call(OEMBED, { method: "POST", headers: SAME_ORIGIN, body: "{}" });
    expect(response.headers.get("Allow")).toBe("GET");
    await expectError(response, 405, "method_not_allowed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("2 回目は 24 時間キャッシュから返す（クライアントへは no-store）", async () => {
    const fetchSpy = mockUpstream(upstreamJson(OEMBED_BODY));
    await call(OEMBED, { headers: SAME_ORIGIN });
    const second = await call(OEMBED, { headers: SAME_ORIGIN });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(200);
    expect(second.headers.get("Cache-Control")).toBe("no-store");
    expect(await second.json()).toEqual(OEMBED_BODY);
    const stored = await caches.default.match(UPSTREAM);
    expect(stored?.headers.get("Cache-Control")).toBe("max-age=86400");
  });

  it("64KB を超える本文は 502", async () => {
    mockUpstream(upstreamJson({ title: "x".repeat(64 * 1024) }));
    await expectError(await call(OEMBED, { headers: SAME_ORIGIN }), 502, "upstream_too_large");
  });

  it("upstream の非 2xx（非公開・削除済み動画など）は 502", async () => {
    mockUpstream(new Response("Not Found", { status: 404 }));
    await expectError(await call(OEMBED, { headers: SAME_ORIGIN }), 502, "upstream_status");
  });

  it("JSON 以外の Content-Type は 502", async () => {
    mockUpstream(new Response("<html></html>", { headers: { "Content-Type": "text/html" } }));
    await expectError(await call(OEMBED, { headers: SAME_ORIGIN }), 502, "upstream_content_type");
  });

  it("タイムアウトは 504", async () => {
    mockUpstream(() => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")));
    await expectError(await call(OEMBED, { headers: SAME_ORIGIN }), 504, "upstream_timeout");
  });

  it("失敗はキャッシュしない", async () => {
    mockUpstream(new Response("oops", { status: 500 }));
    await call(OEMBED, { headers: SAME_ORIGIN });
    expect(await caches.default.match(UPSTREAM)).toBeUndefined();
  });
});
