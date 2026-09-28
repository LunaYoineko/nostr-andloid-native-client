import { afterEach, describe, expect, it, vi } from "vitest";
import { translateAvailable, translateNote } from "./translate";

/** モックの detect()。呼ぶたびに同じ配列を返す */
function stubApis(opts: {
  detected: string | null;
  availability?: "unavailable" | "downloadable" | "downloading" | "available";
  translated?: string;
}) {
  const results = opts.detected === null ? [] : [{ detectedLanguage: opts.detected, confidence: 1 }];
  const detect = vi.fn(async () => results);
  const availability = vi.fn(async () => opts.availability ?? "available");
  const translate = vi.fn(async () => opts.translated ?? "翻訳結果");
  vi.stubGlobal("LanguageDetector", { create: vi.fn(async () => ({ detect })) });
  vi.stubGlobal("Translator", { availability, create: vi.fn(async () => ({ translate })) });
  return { detect, availability, translate };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("translateAvailable", () => {
  it("Translator / LanguageDetector が無ければ false", () => {
    expect(translateAvailable()).toBe(false);
  });

  it("両方あれば true", () => {
    stubApis({ detected: "en" });
    expect(translateAvailable()).toBe(true);
  });
});

describe("translateNote", () => {
  it("非対応ブラウザは null", async () => {
    expect(await translateNote("hello")).toBeNull();
  });

  it("判定した言語が表示言語（jsdom既定 en）と同じなら原文をそのまま返し、Translator は呼ばない", async () => {
    const { availability, translate } = stubApis({ detected: "en" });
    expect(await translateNote("hello")).toBe("hello");
    expect(availability).not.toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
  });

  it("違う言語なら availability → create → translate の結果を返す", async () => {
    const { availability, translate } = stubApis({ detected: "ja", translated: "hello" });
    expect(await translateNote("こんにちは")).toBe("hello");
    expect(availability).toHaveBeenCalledWith({ sourceLanguage: "ja", targetLanguage: "en" });
    expect(translate).toHaveBeenCalledWith("こんにちは");
  });

  it("availability が unavailable なら null（Translator.create は呼ばない）", async () => {
    stubApis({ detected: "ja", availability: "unavailable" });
    expect(await translateNote("こんにちは")).toBeNull();
  });

  it("言語判定に失敗（結果が空）なら null", async () => {
    stubApis({ detected: null });
    expect(await translateNote("???")).toBeNull();
  });

  it("detect が例外を投げても null", async () => {
    vi.stubGlobal("LanguageDetector", {
      create: vi.fn(async () => ({
        detect: vi.fn(async () => {
          throw new Error("boom");
        }),
      })),
    });
    vi.stubGlobal("Translator", { availability: vi.fn(), create: vi.fn() });
    expect(await translateNote("hello")).toBeNull();
  });
});
