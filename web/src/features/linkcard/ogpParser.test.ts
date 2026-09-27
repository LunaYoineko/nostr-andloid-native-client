import { describe, expect, it } from "vitest";
import { decodeHtml, isAmazonUrl, parseOgp } from "./ogpParser";

const URL = "https://example.test/articles/1";

function page(head: string, body = ""): string {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

function bytes(...parts: (string | number[])[]): ArrayBuffer {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === "string") for (const c of part) out.push(c.charCodeAt(0));
    else out.push(...part);
  }
  return new Uint8Array(out).buffer;
}

// 「日本」を Shift_JIS / EUC-JP で書いたバイト列
const NIHON_SJIS = [0x93, 0xfa, 0x96, 0x7b];
const NIHON_EUC = [0xc6, 0xfc, 0xcb, 0xdc];

describe("parseOgp", () => {
  it("og:title / og:description / og:image / og:site_name を拾う（属性の順序・大文字小文字は問わず、実体参照は戻す）", () => {
    const html = page(`
      <meta property="og:title" content="タイトル &amp; 副題">
      <meta content="説明文" property="OG:Description">
      <meta property="og:image" content="https://cdn.example.test/og.png">
      <meta property="og:site_name" content="Example">
      <title>使わない</title>`);
    expect(parseOgp(html, URL)).toEqual({
      url: URL,
      title: "タイトル & 副題",
      description: "説明文",
      image: "https://cdn.example.test/og.png",
      siteName: "Example",
    });
  });

  it("og が無ければ twitter:* → <title> と meta[name=description]", () => {
    const withTwitter = page(`
      <meta name="twitter:title" content="T タイトル">
      <meta name="twitter:description" content="T 説明">
      <meta name="twitter:image" content="https://cdn.example.test/t.png">
      <meta name="description" content="普通の説明">
      <title>ページ名</title>`);
    expect(parseOgp(withTwitter, URL)).toEqual({
      url: URL,
      title: "T タイトル",
      description: "T 説明",
      image: "https://cdn.example.test/t.png",
    });

    const plain = page(`<title>
      ページ名
    </title><meta name="description" content="普通の説明">`);
    expect(parseOgp(plain, URL)).toEqual({ url: URL, title: "ページ名", description: "普通の説明" });
  });

  it("相対 URL の画像は最終 URL を基準に解決する。http(s) 以外の画像は捨てる", () => {
    const html = page(`<meta property="og:image" content="/img/og.png"><title>t</title>`);
    expect(parseOgp(html, "https://s.test/x", "https://www.example.test/a/b")?.image).toBe(
      "https://www.example.test/img/og.png",
    );
    const bad = page(`<meta property="og:image" content="javascript:alert(1)"><title>t</title>`);
    expect(parseOgp(bad, URL)).toEqual({ url: URL, title: "t" });
  });

  it("タイトルも画像も無ければ null（説明・サイト名だけではカードにしない）", () => {
    expect(parseOgp(page(`<meta name="description" content="説明だけ">`), URL)).toBeNull();
    expect(parseOgp(page(`<meta property="og:site_name" content="S"><title>   </title>`), URL)).toBeNull();
    expect(parseOgp("", URL)).toBeNull();
  });

  it("画像だけでもカードにする", () => {
    expect(parseOgp(page(`<meta property="og:image" content="https://i.test/a.png">`), URL)).toEqual({
      url: URL,
      image: "https://i.test/a.png",
    });
  });

  it("本文のスクリプトは実行しない", () => {
    const html = page(
      `<title>t</title>`,
      `<script>globalThis.__ogpExecuted = true</script><img src="x" onerror="globalThis.__ogpExecuted = true">`,
    );
    expect(parseOgp(html, URL)).toEqual({ url: URL, title: "t" });
    expect((globalThis as { __ogpExecuted?: boolean }).__ogpExecuted).toBeUndefined();
  });

  it("Amazon は og:image が無ければ hiRes → landingImage → large の順で商品画像を補う（本文の後半も見る）", () => {
    const amazon = "https://www.amazon.co.jp/dp/B000000000";
    const hiRes = page(
      "<title>商品</title>",
      `<img id="landingImage" src="https://m.media-amazon.test/landing.jpg">
       <script>var data = {"large":"https://m.media-amazon.test/large.jpg","hiRes":"https://m.media-amazon.test/hires.jpg"}</script>`,
    );
    expect(parseOgp(hiRes, amazon)?.image).toBe("https://m.media-amazon.test/hires.jpg");

    const landing = page(
      "<title>商品</title>",
      `<img alt="" id="landingImage" data-x="1" src="https://m.media-amazon.test/landing.jpg">`,
    );
    expect(parseOgp(landing, amazon)?.image).toBe("https://m.media-amazon.test/landing.jpg");

    const large = page(
      "<title>商品</title>",
      `<script>{"large" : "https://m.media-amazon.test/large.jpg"}</script>`,
    );
    expect(parseOgp(large, "https://amzn.to/abc", "https://www.amazon.co.jp/dp/B0")?.image).toBe(
      "https://m.media-amazon.test/large.jpg",
    );

    // Amazon 以外では補わない
    expect(parseOgp(hiRes, URL)).toEqual({ url: URL, title: "商品" });
  });

  it("isAmazonUrl はネイティブと同じ（amazon.* と amzn.to / amzn.asia）", () => {
    expect(isAmazonUrl("https://www.amazon.co.jp/dp/X")).toBe(true);
    expect(isAmazonUrl("https://amazon.com/x")).toBe(true);
    expect(isAmazonUrl("https://amzn.to/x")).toBe(true);
    expect(isAmazonUrl("https://amzn.asia/d/x")).toBe(true);
    expect(isAmazonUrl("https://example.test/amazon.co.jp/")).toBe(false);
  });
});

describe("decodeHtml", () => {
  it("<meta charset> の文字コードで読む（ヘッダより優先）", () => {
    const body = bytes('<html><head><meta charset="Shift_JIS"><title>', NIHON_SJIS, "</title></head></html>");
    expect(decodeHtml(body, "text/html; charset=utf-8")).toContain("<title>日本</title>");
  });

  it("http-equiv の Content-Type も <meta charset> として読む", () => {
    const body = bytes(
      '<head><meta http-equiv="Content-Type" content="text/html; charset=EUC-JP"><title>',
      NIHON_EUC,
      "</title></head>",
    );
    expect(decodeHtml(body, null)).toContain("<title>日本</title>");
  });

  it("<meta> が無ければ upstream の Content-Type の charset、それも無ければ UTF-8", () => {
    const sjis = bytes("<head><title>", NIHON_SJIS, "</title></head>");
    expect(decodeHtml(sjis, 'text/html; charset="Shift_JIS"')).toContain("<title>日本</title>");

    const utf8 = new TextEncoder().encode("<head><title>日本</title></head>");
    expect(decodeHtml(utf8.buffer as ArrayBuffer, "text/html")).toContain("<title>日本</title>");
    expect(decodeHtml(utf8.buffer as ArrayBuffer, null)).toContain("<title>日本</title>");
  });

  it("知らない文字コード名は次の候補へ。<meta> の UTF-16 は UTF-8 として読む", () => {
    const utf8 = new TextEncoder().encode('<head><meta charset="x-unknown"><title>日本</title></head>');
    expect(decodeHtml(utf8.buffer as ArrayBuffer, "text/html; charset=nope")).toContain(
      "<title>日本</title>",
    );

    const utf16 = new TextEncoder().encode('<head><meta charset="utf-16"><title>日本</title></head>');
    expect(decodeHtml(utf16.buffer as ArrayBuffer, null)).toContain("<title>日本</title>");
  });

  it("</head> より後の <meta charset> は見ない", () => {
    const body = bytes("<head><title>", NIHON_SJIS, '</title></head><body><meta charset="EUC-JP"></body>');
    expect(decodeHtml(body, "text/html; charset=Shift_JIS")).toContain("<title>日本</title>");
  });
});
