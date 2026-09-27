import { expect, it } from "vitest";
import { formatAbsoluteTime, relativeTime } from "./time";

const NOW = 1_800_000_000;

it.each([
  [0, "now"],
  [9, "now"],
  [10, "10s"],
  [59, "59s"],
  [60, "1m"],
  [3599, "59m"],
  [3600, "1h"],
  [86399, "23h"],
  [86400, "1d"],
  [604799, "6d"],
  [604800, "1w"],
  [604800 * 5 + 3, "5w"],
])("%i 秒前は %s", (ago, expected) => {
  expect(relativeTime(NOW - ago, NOW)).toBe(expected);
});

it("未来の時刻（時計のずれ）は now", () => {
  expect(relativeTime(NOW + 120, NOW)).toBe("now");
});

it("formatAbsoluteTime は端末のタイムゾーンで yyyy/MM/dd HH:mm（0 埋め）", () => {
  for (const t of [NOW, 1_704_070_805, 1_000_000_000]) {
    const d = new Date(t * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const expected = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    expect(formatAbsoluteTime(t)).toBe(expected);
    expect(formatAbsoluteTime(t)).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
  }
});

it("formatAbsoluteTime は無効な時刻なら空文字", () => {
  expect(formatAbsoluteTime(Number.NaN)).toBe("");
});
