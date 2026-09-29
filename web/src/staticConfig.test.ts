import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * static/ 配下は dist/ にそのままコピーされる Cloudflare Pages の設定ファイル（#647）。
 * ビルドを通さず、ファイルの内容だけを確認する。
 */
const staticDir = join(process.cwd(), "static");

describe("static/_headers（#647）", () => {
  const headers = readFileSync(join(staticDir, "_headers"), "utf8");

  it("/ と /about、docs のページには X-Robots-Tag を付けない", () => {
    for (const path of ["/", "/about", "/themes.html", "/privacy-policy.html", "/child-safety.html"]) {
      const block = blockFor(headers, path);
      expect(block).not.toContain("X-Robots-Tag");
    }
  });

  it("アプリのルートには X-Robots-Tag: noindex を付ける", () => {
    for (const path of [
      "/login",
      "/settings/*",
      "/messages/*",
      "/e/*",
      "/p/*",
      "/t/*",
      "/share",
      "/open",
      "/404",
    ]) {
      expect(blockFor(headers, path)).toContain("X-Robots-Tag: noindex");
    }
  });

  it("Content-Security-Policy が /* にあり、script-src に 'unsafe-inline' を含まない（inline script を置かないため）", () => {
    const block = blockFor(headers, "/*");
    expect(block).toMatch(/Content-Security-Policy:.*script-src 'self';/);
  });

  it("Cache-Control の対象は /assets/*・/index.html・/sw.js・/manifest.webmanifest", () => {
    expect(blockFor(headers, "/assets/*")).toContain("Cache-Control: public, max-age=31536000, immutable");
    for (const path of ["/index.html", "/sw.js", "/manifest.webmanifest"]) {
      expect(blockFor(headers, path)).toContain("Cache-Control: no-cache");
    }
  });
});

/** _headers のパスの見出し行から、次の見出し行（または末尾）までのブロックを返す。無ければ空文字 */
function blockFor(headers: string, path: string): string {
  const lines = headers.split("\n");
  const start = lines.findIndex((line) => line.trim() === path);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim() !== "" && !line.startsWith(" ") && !line.startsWith("\t"));
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}
