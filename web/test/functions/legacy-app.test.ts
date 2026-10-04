import { createPagesEventContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { LEGACY_SW_SCRIPT, onRequest } from "../../functions/app/[[path]]";

const ORIGIN = "https://nostrism.shino3.net";
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

async function call(path: string, init: RequestInit<IncomingRequestCfProperties> = {}): Promise<Response> {
  const request = new IncomingRequest(`${ORIGIN}${path}`, init);
  const ctx = createPagesEventContext<typeof onRequest>({ request, params: {}, data: {} });
  const response = await onRequest(ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("旧 /app 配下（#647）", () => {
  it("/app と /app/ は / へ 301", async () => {
    for (const path of ["/app", "/app/"]) {
      const response = await call(path);
      expect(response.status).toBe(301);
      expect(response.headers.get("Location")).toBe(`${ORIGIN}/`);
    }
  });

  it("/app/foo?x=1 は /foo?x=1 へ 301（クエリを保つ）", async () => {
    const response = await call("/app/settings/relays?x=1");
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(`${ORIGIN}/settings/relays?x=1`);
  });

  it("/app/sw.js は旧 SW を解除するスクリプトを 200 / no-cache で返す（301 にしない）", async () => {
    const response = await call("/app/sw.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    const body = await response.text();
    expect(body).toBe(LEGACY_SW_SCRIPT);
    expect(body).toContain("registration.unregister()");
    expect(body).toContain("caches.delete");
  });
});
