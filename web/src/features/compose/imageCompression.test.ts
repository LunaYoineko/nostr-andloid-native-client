import { afterEach, describe, expect, it } from "vitest";
import {
  COMPRESSION_KEY,
  clampDim,
  clampQuality,
  DEFAULT_COMPRESSION,
  maxDimFor,
  resetImageCompression,
  setImageCompression,
  useImageCompression,
} from "./imageCompression";

afterEach(() => {
  resetImageCompression();
  localStorage.clear();
});

describe("clampDim / clampQuality", () => {
  it("範囲外は丸める（長辺 128〜8192・品質 30〜100。ネイティブ ImageCompressionPrefs.from と同じ範囲）", () => {
    expect(clampDim(127)).toBe(128);
    expect(clampDim(8193)).toBe(8192);
    expect(clampQuality(29)).toBe(30);
    expect(clampQuality(101)).toBe(100);
  });
});

describe("setImageCompression / resetImageCompression", () => {
  it("範囲外を丸めて保存し、他の項目は現在値を保つ", () => {
    setImageCompression({ lowMaxDim: 127, midMaxDim: 8193, quality: 29 });
    expect(useImageCompression.getState().prefs).toEqual({ lowMaxDim: 128, midMaxDim: 8192, quality: 30 });
    expect(JSON.parse(localStorage.getItem(COMPRESSION_KEY) ?? "")).toEqual({
      lowMaxDim: 128,
      midMaxDim: 8192,
      quality: 30,
    });

    setImageCompression({ quality: 50 });
    expect(useImageCompression.getState().prefs).toEqual({ lowMaxDim: 128, midMaxDim: 8192, quality: 50 });
  });

  it("既定に戻すと消える", () => {
    setImageCompression({ quality: 50 });
    resetImageCompression();
    expect(useImageCompression.getState().prefs).toEqual(DEFAULT_COMPRESSION);
    expect(localStorage.getItem(COMPRESSION_KEY)).toBeNull();
  });
});

describe("maxDimFor", () => {
  it("低 / 中はそれぞれの長辺、高は null（無加工）", () => {
    const prefs = { lowMaxDim: 640, midMaxDim: 1200, quality: 85 };
    expect(maxDimFor("low", prefs)).toBe(640);
    expect(maxDimFor("mid", prefs)).toBe(1200);
    expect(maxDimFor("high", prefs)).toBeNull();
  });
});
