import { createPagesEventContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { onRequest } from "../../functions/app/[[path]]";

// ASSETS は vitest.functions.config.ts のフェイク（/app/ と /app/assets/a.css だけがある）
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

describe("/app/* の SPA フォールバック", () => {
  it("(a) 未知のページ遷移は index.html を 200 で返す", async () => {
    const response = await call("/app/login", { headers: HTML });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe(INDEX_HTML);

    // Accept に text/html が無くても Sec-Fetch-Dest: document ならページ遷移とみなす
    const byDest = await call("/app/x/y", { headers: { Accept: "*/*", "Sec-Fetch-Dest": "document" } });
    expect(byDest.status).toBe(200);
    expect(await byDest.text()).toBe(INDEX_HTML);
  });

  it("(b) 実在する静的アセットはその応答をそのまま返す", async () => {
    const response = await call("/app/assets/a.css", { headers: { Accept: "text/css,*/*;q=0.1" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
    expect(await response.text()).toBe("body{}");
  });

  it("(c) ページ遷移でない未知のパスは 404", async () => {
    const response = await call("/app/nope.js", { headers: { Accept: "*/*" } });
    expect(response.status).toBe(404);
  });

  it("(d) GET/HEAD 以外は index.html にしない（404）", async () => {
    const response = await call("/app/login", { method: "POST", headers: HTML, body: "x" });
    expect(response.status).toBe(404);
  });

  it("(e) /app/ はアセットの応答をそのまま返す", async () => {
    const response = await call("/app/", { headers: HTML });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe(INDEX_HTML);
  });
});
