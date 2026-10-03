import { expect, it } from "vitest";
import { ENGLISH_AVAILABLE, resolveLocale } from "./locale";

it("auto はブラウザの先頭の言語で決まる（英語辞書が揃っている前提）", () => {
  expect(resolveLocale("auto", false, ["ja-JP"])).toBe("ja");
  expect(resolveLocale("auto", false, ["ja"])).toBe("ja");
  expect(resolveLocale("auto", false, ["en-US"])).toBe("en");
  expect(resolveLocale("auto", false, ["fr"])).toBe("en");
  expect(resolveLocale("auto", false, [])).toBe("en");
});

it("明示した言語は auto より優先される", () => {
  expect(resolveLocale("ja", false, ["en-US"])).toBe("ja");
  expect(resolveLocale("en", false, ["ja-JP"])).toBe("en");
});

it("関西弁は ja のときだけ ja-kansai になる", () => {
  expect(resolveLocale("ja", true, [])).toBe("ja-kansai");
  expect(resolveLocale("auto", true, ["ja"])).toBe("ja-kansai");
  expect(resolveLocale("en", true, ["ja"])).toBe("en");
  expect(resolveLocale("auto", true, ["en-US"])).toBe("en");
});

it("英語が揃ったので、auto のブラウザが en-US なら en（ゲートは開いている）", () => {
  expect(ENGLISH_AVAILABLE).toBe(true);
  expect(resolveLocale("auto", false, ["en-US"])).toBe("en");
  expect(resolveLocale("en", false, ["ja-JP"])).toBe("en");
});

it("ゲートが閉じていれば（englishAvailable = false）auto でも明示の en でも ja に落とす", () => {
  expect(resolveLocale("auto", false, ["en-US"], false)).toBe("ja");
  expect(resolveLocale("en", false, ["en-US"], false)).toBe("ja");
  expect(resolveLocale("auto", true, ["en-US"], false)).toBe("ja-kansai");
});
