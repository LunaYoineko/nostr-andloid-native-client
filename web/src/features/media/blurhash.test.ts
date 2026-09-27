import { expect, it } from "vitest";
import { decodeBlurhash } from "./blurhash";

// blurha.sh のサンプル（ネイティブの BlurhashTest.kt と同じ）
const SAMPLE = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

it("20×20 の RGBA に展開し、全ピクセル不透明で色に変化がある", () => {
  const pixels = decodeBlurhash(SAMPLE);

  expect(pixels).not.toBeNull();
  if (!pixels) return;
  expect(pixels).toHaveLength(20 * 20 * 4);
  const colors = new Set<string>();
  for (let i = 0; i < pixels.length; i += 4) {
    expect(pixels[i + 3]).toBe(255);
    colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
  }
  expect(colors.size).toBeGreaterThanOrEqual(16);
});

it("空・長さ不一致・不正文字は null", () => {
  expect(decodeBlurhash("")).toBeNull();
  expect(decodeBlurhash(SAMPLE.slice(0, -1))).toBeNull();
  expect(decodeBlurhash(`${SAMPLE.slice(0, -1)}"`)).toBeNull();
});

it("同じ hash は同じ配列を返す（キャッシュ）", () => {
  expect(decodeBlurhash(SAMPLE)).toBe(decodeBlurhash(SAMPLE));
});
