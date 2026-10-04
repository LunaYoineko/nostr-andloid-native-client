import { createPagesEventContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { onRequest } from "../../functions/[[path]]";

// ASSETS は vitest.functions.config.ts のフェイク（/ と /assets/a.css だけがある）
const ORIGIN = "https://nostrism.shino3.net";
const INDEX_HTML = "<!doctype html><title>app</title>";
const HTML = { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };
// Pages Functions が受け取る型（cf プロパティ付き）
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

async function call(path: string, init: RequestInit<IncomingRequestCfProperties> = {}): Promise<Response> {
  const request = new IncomingRequest(`${ORIGIN}${path}`, init);
  const ctx = createPagesEventContext<typeof onRequest>({ request, params: {}, data: {} });
  const response = await onRequest(ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("全パスの SPA フォールバック（#647）", () => {
  it("(a) 未知のページ遷移は index.html を 200 で返す", async () => {
    const response = await call("/login", { headers: HTML });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe(INDEX_HTML);

    // Accept に text/html が無くても Sec-Fetch-Dest: document ならページ遷移とみなす
    const byDest = await call("/x/y", { headers: { Accept: "*/*", "Sec-Fetch-Dest": "document" } });
    expect(byDest.status).toBe(200);
    expect(await byDest.text()).toBe(INDEX_HTML);
  });

  it("(b) 実在する静的アセットはその応答をそのまま返す", async () => {
    const response = await call("/assets/a.css", { headers: { Accept: "text/css,*/*;q=0.1" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
    expect(await response.text()).toBe("body{}");
  });

  it("(c) ページ遷移でない未知のパスは 404", async () => {
    const response = await call("/nope.js", { headers: { Accept: "*/*" } });
    expect(response.status).toBe(404);
  });

  it("(d) GET/HEAD 以外は index.html にしない（404）", async () => {
    const response = await call("/login", { method: "POST", headers: HTML, body: "x" });
    expect(response.status).toBe(404);
  });

  it("(e) / はアセットの応答をそのまま返す", async () => {
    const response = await call("/", { headers: HTML });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe(INDEX_HTML);
  });

  it("(f) アプリのルートは X-Robots-Tag: noindex を付ける（static/_headers ではなくここで。#647）", async () => {
    for (const path of [
      "/login",
      "/settings/account",
      "/messages/x",
      "/e/x",
      "/p/x",
      "/t/x",
      "/share",
      "/open",
      "/404",
    ]) {
      const response = await call(path, { headers: HTML });
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    }
  });

  it("(g) / と /about、その他のルートには X-Robots-Tag を付けない", async () => {
    for (const path of ["/", "/about", "/search", "/settings", "/messages"]) {
      const response = await call(path, { headers: HTML });
      expect(response.headers.get("X-Robots-Tag")).toBeNull();
    }
  });
});

// /api/* は functions/api/[[path]].ts がこの root の fallback より先に処理する（404 JSON。test/functions/channels.test.ts の
// 「その他の /api/*」で確認済み）。ここでは重複させない。
