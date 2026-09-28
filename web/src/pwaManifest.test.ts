import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { describe, expect, it } from "vitest";

/**
 * PWA の manifest（vite.config.ts の VitePWA）に Share Target / protocol_handlers が出ることを、
 * 実際のビルド結果（manifest.webmanifest）を読んで確認する（#541）。dist/app は汚さず一時ディレクトリへ出す。
 */
describe("manifest.webmanifest（#541）", () => {
  it("share_target と protocol_handlers が入っている", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "nostrism-manifest-test-"));
    try {
      await build({
        configFile: join(process.cwd(), "vite.config.ts"),
        build: { outDir, write: true },
        logLevel: "warn",
      });
      const manifest = JSON.parse(readFileSync(join(outDir, "manifest.webmanifest"), "utf8"));
      expect(manifest.share_target).toEqual({
        action: "/app/share",
        method: "GET",
        params: { title: "title", text: "text", url: "url" },
      });
      expect(manifest.protocol_handlers).toEqual([{ protocol: "web+nostr", url: "/app/open?uri=%s" }]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 30_000);
});
