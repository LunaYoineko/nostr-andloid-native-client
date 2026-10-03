import { expect, it } from "vitest";
import { resolveLocale } from "./locale";

it("auto はブラウザの先頭の言語で決まる（英語辞書が揃っている前提）", () => {
  expect(resolveLocale("auto", false, ["ja-JP"], true)).toBe("ja");
  expect(resolveLocale("auto", false, ["ja"], true)).toBe("ja");
  expect(resolveLocale("auto", false, ["en-US"], true)).toBe("en");
  expect(resolveLocale("auto", false, ["fr"], true)).toBe("en");
  expect(resolveLocale("auto", false, [], true)).toBe("en");
});

it("明示した言語は auto より優先される", () => {
  expect(resolveLocale("ja", false, ["en-US"], true)).toBe("ja");
  expect(resolveLocale("en", false, ["ja-JP"], true)).toBe("en");
});

it("関西弁は ja のときだけ ja-kansai になる", () => {
  expect(resolveLocale("ja", true, [])).toBe("ja-kansai");
  expect(resolveLocale("auto", true, ["ja"])).toBe("ja-kansai");
  expect(resolveLocale("en", true, ["ja"], true)).toBe("en");
  expect(resolveLocale("auto", true, ["en-US"], true)).toBe("en");
});

it("英語辞書が揃うまで（ENGLISH_AVAILABLE = false）は、auto でも明示の en でも ja に落とす（日英混在を出さない）", () => {
  expect(resolveLocale("auto", false, ["en-US"], false)).toBe("ja");
  expect(resolveLocale("en", false, ["en-US"], false)).toBe("ja");
  expect(resolveLocale("auto", true, ["en-US"], false)).toBe("ja-kansai");
  // 既定値は今のところ false
  expect(resolveLocale("auto", false, ["en-US"])).toBe("ja");
});
