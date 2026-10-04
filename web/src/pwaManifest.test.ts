import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { describe, expect, it } from "vitest";

/**
 * PWA の manifest（vite.config.ts の VitePWA）が / 配下（#647）で、Share Target / protocol_handlers が
 * 出ることを、実際のビルド結果（manifest.webmanifest）を読んで確認する（#541・#647）。dist/ は汚さず
 * 一時ディレクトリへ出す。
 */
describe("manifest.webmanifest（#541・#647）", () => {
  it("id・start_url・scope が / で、share_target と protocol_handlers が入っている", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "nostrism-manifest-test-"));
    try {
      await build({
        configFile: join(process.cwd(), "vite.config.ts"),
        build: { outDir, write: true },
        logLevel: "warn",
      });
      const manifest = JSON.parse(readFileSync(join(outDir, "manifest.webmanifest"), "utf8"));
      expect(manifest.id).toBe("/");
      expect(manifest.name).toBe("Nostrism");
      expect(manifest.short_name).toBe("Nostrism");
      expect(manifest.description).toBe(
        "A deck-style Nostr client: timelines, hashtags, notifications and chat side by side.",
      );
      expect(manifest.lang).toBe("en");
      expect(manifest.dir).toBe("ltr");
      expect(manifest.start_url).toBe("/");
      expect(manifest.scope).toBe("/");
      expect(manifest.share_target).toEqual({
        action: "/share",
        method: "GET",
        params: { title: "title", text: "text", url: "url" },
      });
      expect(manifest.protocol_handlers).toEqual([{ protocol: "web+nostr", url: "/open?uri=%s" }]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 30_000);
});
