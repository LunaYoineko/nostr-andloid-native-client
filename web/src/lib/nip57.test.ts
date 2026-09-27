import { describe, expect, it } from "vitest";
import { bolt11Sats, zapAmountSats, zapCommentOf, zapRequestOf, zapSenderOf } from "./nip57";

const Z = "a".repeat(64);
const R = "b".repeat(64);

describe("bolt11Sats（ネイティブ Nip57Test と同じ値）", () => {
  it("乗数 m / u / n / p / 無印", () => {
    expect(bolt11Sats("lnbc2500u1pvjluezpp5...")).toBe(250_000);
    expect(bolt11Sats("lnbc20m1pvjluezpp5...")).toBe(2_000_000);
    expect(bolt11Sats("lnbc210n1pxxxxxx")).toBe(21);
    expect(bolt11Sats("lnbc9678785340p1pxxxxxx")).toBe(967_878);
    expect(bolt11Sats("lnbc1")).toBe(100_000_000);
  });

  it("読めなければ 0", () => {
    expect(bolt11Sats("")).toBe(0);
    expect(bolt11Sats("not-an-invoice")).toBe(0);
  });

  it("大文字・前後の空白・テストネットも読む", () => {
    expect(bolt11Sats("  LNBC10U1PXXXX ")).toBe(1_000);
    expect(bolt11Sats("lntb20m1pxxxx")).toBe(2_000_000);
    expect(bolt11Sats("lnbcrt2500u1pxxxx")).toBe(250_000);
  });
});

describe("zapAmountSats", () => {
  it("description の amount（msat）が bolt11 より優先", () => {
    const desc = JSON.stringify({
      kind: 9734,
      content: "",
      tags: [
        ["amount", "21000"],
        ["p", "abcd"],
      ],
    });
    expect(
      zapAmountSats([
        ["description", desc],
        ["bolt11", "lnbc999u1pxxxxxx"],
      ]),
    ).toBe(21);
  });

  it("amount が無ければ bolt11 から", () => {
    const desc = JSON.stringify({ kind: 9734, tags: [["p", "abcd"]] });
    expect(
      zapAmountSats([
        ["description", desc],
        ["bolt11", "lnbc10u1pxxxxxx"],
      ]),
    ).toBe(1_000);
    expect(zapAmountSats([["bolt11", "lnbc10u1pxxxxxx"]])).toBe(1_000);
  });

  it("どちらも無ければ 0", () => {
    expect(zapAmountSats([["p", "abcd"]])).toBe(0);
  });
});

describe("zapSenderOf", () => {
  const request = (pubkey: string) => ["description", JSON.stringify({ kind: 9734, pubkey, tags: [] })];

  it("P タグを優先し、小文字にする", () => {
    expect(zapSenderOf([["P", Z.toUpperCase()], request(R)])).toBe(Z);
  });

  it("P が無ければ description の pubkey", () => {
    expect(zapSenderOf([request(R)])).toBe(R);
  });

  it("64 桁 hex でなければ次へ、全部無ければ null", () => {
    expect(zapSenderOf([["P", "npub1xyz"], request(R)])).toBe(R);
    expect(zapSenderOf([["P", "npub1xyz"], request("short")])).toBeNull();
    expect(zapSenderOf([["p", Z]])).toBeNull();
  });
});

describe("zapCommentOf / zapRequestOf", () => {
  it("description の content", () => {
    expect(zapCommentOf([["description", JSON.stringify({ content: "ありがとう", tags: [] })]])).toBe(
      "ありがとう",
    );
    expect(zapCommentOf([["description", JSON.stringify({ tags: [] })]])).toBe("");
  });

  it('壊れた JSON・配列は null / ""', () => {
    expect(zapCommentOf([["description", "{not json"]])).toBe("");
    expect(zapRequestOf([["description", "{not json"]])).toBeNull();
    expect(zapRequestOf([["description", "[1, 2]"]])).toBeNull();
    expect(zapRequestOf([])).toBeNull();
  });
});
