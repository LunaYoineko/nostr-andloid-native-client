import { afterEach, describe, expect, it } from "vitest";
import { applyOsAttribute, isIOS } from "./platform";

describe("isIOS", () => {
  it("iPhone は true", () => {
    expect(isIOS({ platform: "iPhone", maxTouchPoints: 5 })).toBe(true);
  });

  it("iPad（iPadOS 13+ は MacIntel + タッチあり）は true", () => {
    expect(isIOS({ platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
  });

  it("Android は false", () => {
    expect(isIOS({ platform: "Linux armv8l", maxTouchPoints: 5 })).toBe(false);
  });

  it("PC（MacIntel だがタッチ無し、または Win32）は false", () => {
    expect(isIOS({ platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(isIOS({ platform: "Win32", maxTouchPoints: 0 })).toBe(false);
  });
});

describe("applyOsAttribute", () => {
  afterEach(() => {
    delete document.documentElement.dataset.os;
  });

  it('iOS なら <html> に data-os="ios" を付ける', () => {
    applyOsAttribute({ platform: "iPhone", maxTouchPoints: 5 });
    expect(document.documentElement.dataset.os).toBe("ios");
  });

  it("iOS 以外は data-os を付けない（既存の値も外す）", () => {
    document.documentElement.dataset.os = "ios";
    applyOsAttribute({ platform: "Linux armv8l", maxTouchPoints: 5 });
    expect(document.documentElement.dataset.os).toBeUndefined();
  });
});
