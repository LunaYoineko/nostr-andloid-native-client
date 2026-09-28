import { naddrEncode, neventEncode, noteEncode } from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import { type MdBlock, parseInline, parseMarkdownBlocks } from "./markdown";

const ID = "5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36";

describe("parseMarkdownBlocks", () => {
  it("見出し・段落・箇条書き・引用・水平線・フェンスコードに分ける", () => {
    const md = [
      "# 見出し1",
      "### 見出し3",
      "",
      "段落1行目",
      "段落2行目",
      "",
      "- 箇条書きA",
      "* 箇条書きB",
      "1. 番号A",
      "2) 番号B",
      "",
      "> 引用1",
      "> 引用2",
      "",
      "---",
      "",
      "```",
      "const x = 1;",
      "```",
    ].join("\n");

    expect(parseMarkdownBlocks(md)).toEqual([
      { type: "heading", level: 1, text: "見出し1" },
      { type: "heading", level: 3, text: "見出し3" },
      { type: "paragraph", text: "段落1行目\n段落2行目" },
      { type: "listItem", text: "箇条書きA", ordered: false, index: 0 },
      { type: "listItem", text: "箇条書きB", ordered: false, index: 0 },
      { type: "listItem", text: "番号A", ordered: true, index: 1 },
      { type: "listItem", text: "番号B", ordered: true, index: 2 },
      { type: "quote", text: "引用1\n引用2" },
      { type: "rule" },
      { type: "code", text: "const x = 1;" },
    ]);
  });

  it("行単位の画像はブロック画像になる", () => {
    expect(parseMarkdownBlocks("前置き\n\n![alt文字](https://example.com/a.png)\n\n後書き")).toEqual([
      { type: "paragraph", text: "前置き" },
      { type: "image", url: "https://example.com/a.png", alt: "alt文字" },
      { type: "paragraph", text: "後書き" },
    ] satisfies MdBlock[]);
  });

  it("行単位の nostr:note1 / nevent1 参照はブロックになる", () => {
    const note1 = noteEncode(ID);
    const nevent1 = neventEncode({ id: ID, relays: ["wss://r"] });
    const blocks = parseMarkdownBlocks(`nostr:${note1}\n\n\`nostr:${nevent1}\``);
    expect(blocks).toEqual([
      { type: "noteRef", encoded: note1 },
      { type: "noteRef", encoded: nevent1 },
    ]);
  });

  it("行単位の nostr:naddr1 参照はブロックになる", () => {
    const naddr = naddrEncode({ kind: 30023, pubkey: getPublicKey(generateSecretKey()), identifier: "d" });
    expect(parseMarkdownBlocks(`nostr:${naddr}`)).toEqual([{ type: "addrRef", encoded: naddr }]);
  });

  it("チェックサムが壊れた bech32 は行ごと段落として素通しする", () => {
    expect(parseMarkdownBlocks("nostr:naddr1invalidchecksum")).toEqual([
      { type: "paragraph", text: "nostr:naddr1invalidchecksum" },
    ]);
  });

  it("HTML タグは解釈せず文字のまま段落に残る", () => {
    expect(parseMarkdownBlocks("<b>bold</b> と <script>alert(1)</script>")).toEqual([
      { type: "paragraph", text: "<b>bold</b> と <script>alert(1)</script>" },
    ]);
  });
});

describe("parseInline", () => {
  it("太字・斜体・code・リンク・素URL をトークンにする", () => {
    expect(
      parseInline("**太字** と *斜体* と `code` と [リンク](https://example.com) と https://x.co/a"),
    ).toEqual([
      { type: "bold", value: "太字" },
      { type: "text", value: " と " },
      { type: "italic", value: "斜体" },
      { type: "text", value: " と " },
      { type: "code", value: "code" },
      { type: "text", value: " と " },
      { type: "link", label: "リンク", href: "https://example.com" },
      { type: "text", value: " と " },
      { type: "link", label: "https://x.co/a", href: "https://x.co/a" },
    ]);
  });

  it("リンク先が nostr 参照ならそのままアプリ内リンクの href にする（nostr: の有無どちらも）", () => {
    const naddr = naddrEncode({ kind: 30023, pubkey: getPublicKey(generateSecretKey()), identifier: "d" });
    expect(parseInline(`[記事](nostr:${naddr})`)).toEqual([
      { type: "link", label: "記事", href: `nostr:${naddr}` },
    ]);
    expect(parseInline(`[記事](${naddr})`)).toEqual([{ type: "link", label: "記事", href: naddr }]);
  });

  it("javascript: など http(s) / nostr 以外へのリンクは地の文字になる", () => {
    expect(parseInline("[相対](/etc/passwd)")).toEqual([{ type: "text", value: "相対" }]);
    expect(parseInline("見て [ここ](data:text/html,x) ね")).toEqual([
      { type: "text", value: "見て " },
      { type: "text", value: "ここ" },
      { type: "text", value: " ね" },
    ]);
  });

  it("プレーンな文字列はそのまま 1 つの text", () => {
    expect(parseInline("ただの文章")).toEqual([{ type: "text", value: "ただの文章" }]);
  });
});
