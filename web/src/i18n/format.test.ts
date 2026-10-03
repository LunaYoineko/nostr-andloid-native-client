import { afterEach, expect, it } from "vitest";
import { formatDateTimeLocal, formatNumber } from "./format";
import { setLocaleSetting } from "./locale";

afterEach(() => setLocaleSetting("ja"));

it("言語に合わせた桁区切りと日時の表記", () => {
  const date = new Date(2026, 9, 3, 14, 5, 6);
  setLocaleSetting("en");
  expect(formatNumber(1234567)).toBe("1,234,567");
  expect(formatDateTimeLocal(date)).toBe(date.toLocaleString("en"));
  setLocaleSetting("ja");
  expect(formatNumber(1234567)).toBe("1,234,567");
  expect(formatDateTimeLocal(date)).toBe(date.toLocaleString("ja"));
});
