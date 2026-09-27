import { describe, expect, it } from "vitest";
import { type ContentToken, tokenizeNostrContent } from "./tokenize";

// ネイティブ nostr-core の NostrContentTest.kt を写したものと、Web で食い違っていたケース

function urls(text: string) {
  return tokenizeNostrContent(text).flatMap((t) => (t.type === "url" ? [t.url] : []));
}

function refs(text: string) {
  return tokenizeNostrContent(text).filter((t) => t.type === "nostr");
}

function tags(text: string) {
  return tokenizeNostrContent(text).flatMap((t) => (t.type === "hashtag" ? [t.tag] : []));
}

function codes(text: string) {
  return tokenizeNostrContent(text).flatMap((t) => (t.type === "emoji" ? [t.code] : []));
}

/** 種類と本文上の文字列だけにした列 */
function shape(text: string) {
  return tokenizeNostrContent(text).map((t: ContentToken) => [t.type, text.slice(t.start, t.end)]);
}

describe("NostrContentTest.kt と同じ", () => {
  it("URL は空白までで、末尾の句読点を外す", () => {
    expect(urls("見て https://example.com/a。 続き")).toEqual(["https://example.com/a"]);
    expect(urls("(https://example.com/x)")).toEqual(["https://example.com/x"]);
    expect(urls("http://a.co と https://b.co")).toEqual(["http://a.co", "https://b.co"]);
  });

  it("URL の位置が正確", () => {
    const t = "a https://x.co b";
    const [u] = tokenizeNostrContent(t).filter((token) => token.type === "url");
    expect(t.slice(u.start, u.end)).toBe("https://x.co");
  });

  it("nostr: 付きと素の参照", () => {
    expect(refs("gm nostr:npub1abc def")).toMatchObject([{ bech: "npub1abc", hadPrefix: true }]);
    expect(refs("see note1xyz here")).toMatchObject([{ bech: "note1xyz", hadPrefix: false }]);
  });

  it("素の参照は直前が英数字なら拾わない", () => {
    expect(refs("xnpub1abc")).toEqual([]);
    expect(refs("(npub1abc)")).toHaveLength(1);
  });

  it("URL のパス中の参照は URL の一部", () => {
    const t = "see https://njump.me/note1qqqq and note1zzz";
    expect(urls(t)).toEqual(["https://njump.me/note1qqqq"]);
    expect(refs(t).map((r) => (r.type === "nostr" ? r.bech : ""))).toEqual(["note1zzz"]);
    expect(refs("https://example.com/p/npub1abcdef")).toEqual([]);
    expect(refs("https://example.com/open?ref=nevent1qqqqq")).toEqual([]);
  });

  it("有効な接頭辞だけ", () => {
    expect(refs("nostr:hello world")).toEqual([]);
    expect(refs("nostr:nprofile1qqq")).toMatchObject([{ bech: "nprofile1qqq" }]);
  });

  it("#タグ・:shortcode:・素のテキスト", () => {
    expect(tags("gm #nostr and #zap!")).toEqual(["nostr", "zap"]);
    expect(codes(":smile: hi")).toEqual(["smile"]);
    expect(tokenizeNostrContent("plain text only")).toEqual([{ type: "text", start: 0, end: 15 }]);
  });

  it("トークンの範囲をつなぐと元の文字列に戻る", () => {
    for (const s of [
      "gm nostr:npub1abc see https://x.co/a。 #nostr :smile: end",
      "no tokens here",
      "https://a.co#frag and note1zzz",
    ]) {
      expect(
        tokenizeNostrContent(s)
          .map((t) => s.slice(t.start, t.end))
          .join(""),
      ).toBe(s);
    }
  });
});

describe("nostr 参照の境界（#479）", () => {
  it("日本語の直後・「」の中・( の直後でも拾い、bech32 は ASCII の小英数字で終わる", () => {
    expect(shape("これnostr:npub1abcです")).toEqual([
      ["text", "これ"],
      ["nostr", "nostr:npub1abc"],
      ["text", "です"],
    ]);
    expect(shape("「npub1abc」")).toEqual([
      ["text", "「"],
      ["nostr", "npub1abc"],
      ["text", "」"],
    ]);
    expect(shape("文(nevent1abc)")).toEqual([
      ["text", "文("],
      ["nostr", "nevent1abc"],
      ["text", ")"],
    ]);
    expect(shape("引用note1abc")).toEqual([
      ["text", "引用"],
      ["nostr", "note1abc"],
    ]);
  });

  it("nostr: 付きは直前が英数字でも拾い、大文字や接頭辞の無いものは拾わない", () => {
    expect(refs("xnostr:npub1abc")).toMatchObject([{ bech: "npub1abc", hadPrefix: true }]);
    expect(refs("NPUB1ABC nostr:NPUB1ABC")).toEqual([]);
    expect(refs("naddr1abc")).toMatchObject([{ bech: "naddr1abc" }]);
  });
});

describe("カスタム絵文字の shortcode（#479）", () => {
  it("日本語・数字・_・- を含み、大文字小文字はそのまま", () => {
    expect(codes(":おはよう: :Smile: :a_b-1:")).toEqual(["おはよう", "Smile", "a_b-1"]);
  });

  it("閉じる : が無い・空・記号を挟むものは shortcode にしない", () => {
    expect(codes(":smile :: :a b: :a.b:")).toEqual([]);
  });

  it("前から順に閉じ : までを取る（:a:b: は :a: だけ）", () => {
    expect(codes(":a:b:")).toEqual(["a"]);
  });

  it("サロゲートペアの文字（絵文字・𠮷）は文字に含めない", () => {
    expect(codes(":😀: :𠮷:")).toEqual([]);
  });
});

describe("#タグの直前条件（#479）", () => {
  it("直前が英数字・日本語・# でもタグにする", () => {
    expect(shape("abc#tag")).toEqual([
      ["text", "abc"],
      ["hashtag", "#tag"],
    ]);
    expect(shape("C#言語")).toEqual([
      ["text", "C"],
      ["hashtag", "#言語"],
    ]);
    expect(tags("日本語#タグ ##two")).toEqual(["タグ", "two"]);
  });

  it("タグは文字・数字（Nd）・_ まで", () => {
    expect(tags("#tag_1、#タグ! #a-b")).toEqual(["tag_1", "タグ", "a"]);
    expect(tags("# #! #")).toEqual([]);
  });
});
