import { decode } from "nostr-tools/nip19";

/**
 * [#534] NIP-23 長文記事向けの簡易 Markdown パーサ（ネイティブ Markdown.kt の parseBlocks / renderInline の移植）。
 * 完全な CommonMark 互換ではなく「記事が読める」ことを目標にした実装。ここは純関数のみで、HTML 文字列も
 * React 要素も作らない（描画は ArticleMarkdown.tsx。dangerouslySetInnerHTML は使わない）。
 * 対応: 見出し(#〜######) / 段落 / 箇条書き(-,*,数字.) / 引用(>) / 水平線(---) / フェンスコード(```) /
 *       行単位の画像(![]())・nostr:note1/nevent1 参照・nostr:naddr1 参照。
 *       インライン: **太字** *斜体* `code` [リンク](url) 素URL（http/https のみ）。
 */

export type MdBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "listItem"; text: string; ordered: boolean; index: number }
  | { type: "image"; url: string; alt: string }
  /** 行単位の nostr:note1/nevent1 参照（引用カードで埋め込む） */
  | { type: "noteRef"; encoded: string }
  /** 行単位の nostr:naddr1 参照（記事カードで埋め込む） */
  | { type: "addrRef"; encoded: string }
  | { type: "rule" };

const HEADING_LINE = /^#{1,6}\s+.*$/;
const IMAGE_LINE = /^!\[([^\]]*)]\(([^)\s]+)[^)]*\)\s*$/;
const ORDERED_ITEM = /^(\d+)[.)]\s+(.*)$/;
// 行単位の参照。バッククォートで包まれることがあるので `…` も許容する（ネイティブと同じ）
const NOTE_REF_LINE = /^`?(?:nostr:)?((?:note|nevent)1[a-z0-9]+)`?\s*$/;
const ADDR_REF_LINE = /^`?(?:nostr:)?(naddr1[a-z0-9]+)`?\s*$/;

/** bech32 が期待した種類にデコードできるときだけそのまま返す（チェックサム不一致等は null） */
function decodedBechOfType(bech: string, types: readonly string[]): string | null {
  try {
    return types.includes(decode(bech).type) ? bech : null;
  } catch {
    return null;
  }
}

/** src を行単位のブロックへ分割する（ネイティブ parseBlocks と同じ手順） */
export function parseMarkdownBlocks(src: string): MdBlock[] {
  const out: MdBlock[] = [];
  const lines = src.split("\n");
  let i = 0;
  let para: string[] = [];
  const flushPara = () => {
    const text = para.join("\n").trim();
    if (text !== "") out.push({ type: "paragraph", text });
    para = [];
  };
  const pushRaw = (line: string) => para.push(line);

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flushPara();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      out.push({ type: "code", text: buf.join("\n").trimEnd() });
    } else if (HEADING_LINE.test(trimmed)) {
      flushPara();
      let level = 0;
      while (trimmed[level] === "#") level++;
      out.push({ type: "heading", level, text: trimmed.slice(level).trim() });
    } else if (IMAGE_LINE.test(trimmed)) {
      flushPara();
      const m = IMAGE_LINE.exec(trimmed);
      if (m) out.push({ type: "image", url: m[2], alt: m[1] });
    } else if (NOTE_REF_LINE.test(trimmed)) {
      const m = NOTE_REF_LINE.exec(trimmed);
      const encoded = m ? decodedBechOfType(m[1], ["note", "nevent"]) : null;
      if (encoded) {
        flushPara();
        out.push({ type: "noteRef", encoded });
      } else {
        pushRaw(line);
      }
    } else if (ADDR_REF_LINE.test(trimmed)) {
      const m = ADDR_REF_LINE.exec(trimmed);
      const encoded = m ? decodedBechOfType(m[1], ["naddr"]) : null;
      if (encoded) {
        flushPara();
        out.push({ type: "addrRef", encoded });
      } else {
        pushRaw(line);
      }
    } else if (trimmed.startsWith(">")) {
      flushPara();
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].trim().replace(/^>/, "").trim());
        i++;
      }
      i--;
      out.push({ type: "quote", text: buf.join("\n").trim() });
    } else if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      flushPara();
      out.push({ type: "rule" });
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      flushPara();
      out.push({ type: "listItem", text: trimmed.slice(2).trim(), ordered: false, index: 0 });
    } else if (ORDERED_ITEM.test(trimmed)) {
      flushPara();
      const m = ORDERED_ITEM.exec(trimmed);
      if (m) out.push({ type: "listItem", text: m[2], ordered: true, index: Number(m[1]) || 0 });
    } else if (trimmed === "") {
      flushPara();
    } else {
      pushRaw(line);
    }
    i++;
  }
  flushPara();
  return out;
}

// ---- インライン ----

export type MdInline =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }
  /** href は http(s) か nostr 参照（nostr: の有無どちらでも）だけ。それ以外は text に落ちる */
  | { type: "link"; label: string; href: string };

const INLINE_TOKEN =
  /\[([^\]]+)]\(([^)\s]+)[^)]*\)|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|(https?:\/\/[^\s)\]}>,\u3001\u3002\u300D]+)/g;

/** リンク先が http(s) か nostr 参照（npub/nprofile/note/nevent/naddr。nostr: は任意）だけを許す */
function isSafeHref(href: string): boolean {
  if (/^https?:\/\//i.test(href)) return true;
  const bare = href.replace(/^nostr:/i, "");
  return /^(?:npub|nprofile|note|nevent|naddr)1[a-z0-9]+$/i.test(bare);
}

/**
 * **太字** *斜体* `code` [リンク](url) 素URL をトークン列にする（ネイティブ renderInline と同じ処理順）。
 * リンク先が http(s) / nostr 参照以外（javascript: 等）なら地の文字（label のみ）にする。
 */
export function parseInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  let idx = 0;
  INLINE_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null = INLINE_TOKEN.exec(text);
  while (m !== null) {
    if (m.index > idx) out.push({ type: "text", value: text.slice(idx, m.index) });
    if (m[1] !== undefined) {
      if (isSafeHref(m[2])) out.push({ type: "link", label: m[1], href: m[2] });
      else out.push({ type: "text", value: m[1] });
    } else if (m[3] !== undefined) {
      out.push({ type: "bold", value: m[3] });
    } else if (m[4] !== undefined) {
      out.push({ type: "italic", value: m[4] });
    } else if (m[5] !== undefined) {
      out.push({ type: "code", value: m[5] });
    } else if (m[6] !== undefined) {
      out.push({ type: "link", label: m[6], href: m[6] });
    }
    idx = m.index + m[0].length;
    m = INLINE_TOKEN.exec(text);
  }
  if (idx < text.length) out.push({ type: "text", value: text.slice(idx) });
  return out;
}
