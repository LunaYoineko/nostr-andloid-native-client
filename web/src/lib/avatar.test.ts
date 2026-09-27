import { expect, it } from "vitest";
import { avatarInitial, avatarShade } from "./avatar";

it.each([
  ["alice", "A"],
  ["  bob", "B"],
  ["3bf0c63fcb", "3"],
  ["しの", "し"],
  ["😺 cat", "😺"],
  ["ßeta", "ß"],
  ["", "?"],
  ["   ", "?"],
])("%j の頭文字は %s", (seed, expected) => {
  expect(avatarInitial(seed)).toBe(expected);
});

/** ネイティブの monoShade を 32 ビット整数のまま計算した明度（BigInt で Kotlin の Int を再現） */
function kotlinShade(seed: string): number {
  let h = 0n;
  for (let i = 0; i < seed.length; i++) h = BigInt.asIntN(32, h * 31n + BigInt(seed.charCodeAt(i)));
  const abs = h < 0n && h !== -2147483648n ? -h : h;
  return 56 + Number(abs % 56n);
}

it("短い seed はそのまま計算した明度になる", () => {
  expect(avatarShade("")).toBe("rgb(56, 56, 56)");
  // "a" = 97 → 56 + 97 % 56 = 97
  expect(avatarShade("a")).toBe("rgb(97, 97, 97)");
});

it.each([
  "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
  "しのはら",
  "Nostr ユーザー 😺",
  "a".repeat(100),
])("桁あふれしても Kotlin の Int と同じ明度になる（%s）", (seed) => {
  const v = kotlinShade(seed);
  expect(avatarShade(seed)).toBe(`rgb(${v}, ${v}, ${v})`);
  expect(v).toBeGreaterThanOrEqual(56);
  expect(v).toBeLessThanOrEqual(111);
});
