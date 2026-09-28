import { npubEncode, nsecEncode } from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import { nsecHead, parseNsec } from "./nsec";

describe("parseNsec", () => {
  it("nsec を 32 byte の秘密鍵にする", () => {
    const sk = generateSecretKey();
    const parsed = parseNsec(nsecEncode(sk));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(Array.from(parsed.secretKey)).toEqual(Array.from(sk));
  });

  it("途中の空白・改行は除く", () => {
    const sk = generateSecretKey();
    const nsec = nsecEncode(sk);
    const parsed = parseNsec(`  ${nsec.slice(0, 20)} \n${nsec.slice(20, 40)}\t${nsec.slice(40)}\n`);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(Array.from(parsed.secretKey)).toEqual(Array.from(sk));
  });

  it("nsec1 で始まらなければ format", () => {
    const npub = npubEncode(getPublicKey(generateSecretKey()));
    for (const input of [npub, "", "abc"]) {
      expect(parseNsec(input)).toEqual({ ok: false, reason: "format" });
    }
  });

  it("チェックサム違い・0 の鍵は key", () => {
    const nsec = nsecEncode(generateSecretKey());
    const last = nsec.at(-1);
    const broken = nsec.slice(0, -1) + (last === "q" ? "p" : "q");
    expect(parseNsec(broken)).toEqual({ ok: false, reason: "key" });
    expect(parseNsec(nsecEncode(new Uint8Array(32)))).toEqual({ ok: false, reason: "key" });
  });
});

describe("nsecHead", () => {
  it("空白を除いた先頭 8 文字。空なら（空）", () => {
    expect(nsecHead("  ab cd ef gh ij ")).toBe("abcdefgh");
    expect(nsecHead("")).toBe("(空)");
  });
});
