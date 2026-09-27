import { describe, expect, it } from "vitest";
import { isSameOrigin, readLimited, validateTargetUrl } from "../src/guard";

const SELF = "nostrism.shino3.net";

function reasonOf(input: string, selfHost = SELF): string {
  const result = validateTargetUrl(input, selfHost);
  return result.ok ? "ok" : result.reason;
}

describe("validateTargetUrl", () => {
  it.each([
    "https://example.com/",
    "https://example.com:443/path?q=1#frag",
    "https://sub.example.co.jp/a/b",
    "https://EXAMPLE.com/",
    "https://例え.jp/",
    "https://example.com./",
  ])("許可: %s", (input) => {
    const result = validateTargetUrl(input, SELF);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.protocol).toBe("https:");
  });

  it("正規化済みの URL を返す", () => {
    const result = validateTargetUrl("https://EXAMPLE.com:443/a", SELF);
    expect(result.ok && result.url.href).toBe("https://example.com/a");
  });

  it.each([
    ["http://example.com/", "scheme"],
    ["ftp://example.com/", "scheme"],
    ["javascript:alert(1)", "scheme"],
    ["data:text/html,hi", "scheme"],
  ])("https 以外を拒否: %s", (input, reason) => {
    expect(reasonOf(input)).toBe(reason);
  });

  it.each(["https://example.com:8443/", "https://example.com:80/", "https://example.com:0/"])(
    "443 以外のポートを拒否: %s",
    (input) => {
      expect(reasonOf(input)).toBe("port");
    },
  );

  it.each([
    "https://127.0.0.1/",
    "https://10.0.0.1/",
    "https://169.254.169.254/latest/meta-data/",
    "https://192.168.1.1/",
    "https://2130706433/", // 10 進整数表記の 127.0.0.1
    "https://0x7f000001/", // 16 進表記
    "https://0x7f.0.0.1/", // 16 進ドット表記
    "https://0177.0.0.1/", // 8 進表記
    "https://127.1/", // 省略表記
    "https://[::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://[fd00::1]/",
  ])("IP リテラルを拒否: %s", (input) => {
    expect(reasonOf(input)).toBe("ip_literal");
  });

  it.each([
    "https://localhost/",
    "https://LOCALHOST/",
    "https://localhost./",
    "https://foo.localhost/",
    "https://printer.local/",
    "https://metadata.google.internal/",
    "https://1.0.0.127.in-addr.arpa/",
    "https://home.arpa/",
  ])("特殊用途のホストを拒否: %s", (input) => {
    expect(reasonOf(input)).toBe("blocked_host");
  });

  it.each(["https://intranet/", "https://com/"])("単一ラベルのホストを拒否: %s", (input) => {
    expect(reasonOf(input)).toBe("single_label");
  });

  it.each([
    ["https://nostrism.shino3.net/api/og", SELF],
    ["https://NOSTRISM.shino3.net./", SELF],
    ["https://preview-abc.nostrism-web.example.workers.dev/", "preview-abc.nostrism-web.example.workers.dev"],
    ["https://nostrism.shino3.net/", "nostrism.shino3.net:8787"],
  ])("自ホストを拒否: %s (self=%s)", (input, self) => {
    expect(reasonOf(input, self)).toBe("self_host");
  });

  it("自ホストのサブドメインでない別ホストは許可", () => {
    expect(reasonOf("https://shino3.net/")).toBe("ok");
  });

  it.each(["https://user:pass@example.com/", "https://user@example.com/", "https://:pass@example.com/"])(
    "userinfo を拒否: %s",
    (input) => {
      expect(reasonOf(input)).toBe("userinfo");
    },
  );

  it("2048 文字を超える URL を拒否し、2048 文字ちょうどは許可", () => {
    const base = "https://example.com/";
    expect(reasonOf(base + "a".repeat(2048 - base.length))).toBe("ok");
    expect(reasonOf(base + "a".repeat(2049 - base.length))).toBe("too_long");
  });

  it.each(["", "not a url", "https://", "//example.com/"])("URL として解釈できない入力を拒否: %j", (input) => {
    expect(reasonOf(input)).toBe("invalid_url");
  });
});

describe("isSameOrigin", () => {
  const URL_ = "https://nostrism.shino3.net/api/nchan/channels";
  const req = (headers: Record<string, string>) => new Request(URL_, { headers });

  it("Sec-Fetch-Site: same-origin なら許可", () => {
    expect(isSameOrigin(req({ "Sec-Fetch-Site": "same-origin" }))).toBe(true);
  });

  it("Origin のホストが一致すれば許可", () => {
    expect(isSameOrigin(req({ Origin: "https://nostrism.shino3.net" }))).toBe(true);
  });

  it("Referer のホストが一致すれば許可", () => {
    expect(isSameOrigin(req({ Referer: "https://nostrism.shino3.net/app/" }))).toBe(true);
  });

  it("ヘッダが無ければ拒否", () => {
    expect(isSameOrigin(req({}))).toBe(false);
  });

  it.each<Record<string, string>>([
    { "Sec-Fetch-Site": "cross-site" },
    { "Sec-Fetch-Site": "same-site", Origin: "https://evil.shino3.net" },
    { Origin: "https://evil.example" },
    { Origin: "null" },
    { Referer: "https://nostrism.shino3.net.evil.example/" },
    { Origin: "https://nostrism.shino3.net:8443" },
    // 上位ヘッダが不一致なら下位ヘッダの一致では救済しない
    { Origin: "https://evil.example", Referer: "https://nostrism.shino3.net/app/" },
    { Origin: "null", Referer: "https://nostrism.shino3.net/app/" },
    { "Sec-Fetch-Site": "cross-site", Origin: "https://nostrism.shino3.net" },
  ])("別オリジンは拒否: %j", (headers) => {
    expect(isSameOrigin(req(headers))).toBe(false);
  });
});

describe("readLimited", () => {
  const streamOf = (...chunks: number[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const size of chunks) controller.enqueue(new Uint8Array(size).fill(0x61));
        controller.close();
      },
    });

  it("上限以内なら全体を返す", async () => {
    const result = await readLimited(streamOf(3, 4), 7);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes.byteLength).toBe(7);
  });

  it("上限を超えたら too_large", async () => {
    const result = await readLimited(streamOf(4, 4), 7);
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("body が null なら空", async () => {
    const result = await readLimited(null, 10);
    expect(result.ok && result.bytes.byteLength).toBe(0);
  });
});
