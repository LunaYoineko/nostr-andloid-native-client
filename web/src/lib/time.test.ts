import { expect, it } from "vitest";
import { relativeTime } from "./time";

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
