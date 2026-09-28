/**
 * 本文のトークナイザ（ネイティブ nostr-core の NostrContent.kt tokenizeNostrContent の移植）。
 * 文字は UTF-16 のコード単位で数える（Kotlin の Char と同じ。サロゲートペアの片割れは文字・数字ではない）。
 */
export type ContentToken =
  /** 装飾対象でない素のテキスト */
  | { type: "text"; start: number; end: number }
  /** http(s) URL。url は末尾の句読点・閉じ括弧を除いたもの */
  | { type: "url"; url: string; start: number; end: number }
  /** nostr 参照。bech は npub1/nprofile1/note1/nevent1/naddr1 …（nostr: は含まない） */
  | { type: "nostr"; bech: string; hadPrefix: boolean; start: number; end: number }
  /** #タグ。tag は先頭の # を除いたもの */
  | { type: "hashtag"; tag: string; start: number; end: number }
  /** :shortcode: の候補。emoji タグとの照合は呼び出し側でする（code は前後の : を除いたもの） */
  | { type: "emoji"; code: string; start: number; end: number };

/** nostr 参照の接頭辞（長い順＝最長一致） */
const ENTITY_PREFIXES = ["nprofile1", "nevent1", "naddr1", "npub1", "note1"];

/** URL の末尾から外す句読点・閉じ括弧 */
const URL_TAIL = ").,!?；。、）】」』";

/** Kotlin の Char.isLetterOrDigit（L* か Nd）。1 コード単位ずつ見る */
const LETTER_OR_DIGIT = /^[\p{L}\p{Nd}]$/u;

function isLetterOrDigit(c: string): boolean {
  return LETTER_OR_DIGIT.test(c);
}

/** Kotlin の Char.isWhitespace（JS の \s から U+FEFF を除き、U+001C〜U+001F を足したもの） */
function isWhitespace(c: string): boolean {
  const ch = c.charCodeAt(0);
  return (
    (ch >= 0x09 && ch <= 0x0d) ||
    (ch >= 0x1c && ch <= 0x20) ||
    ch === 0xa0 ||
    ch === 0x1680 ||
    (ch >= 0x2000 && ch <= 0x200a) ||
    ch === 0x2028 ||
    ch === 0x2029 ||
    ch === 0x202f ||
    ch === 0x205f ||
    ch === 0x3000
  );
}

function isAsciiAlnum(c: string): boolean {
  return (c >= "0" && c <= "9") || (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

/** bech32 として取り込む文字（ASCII の小文字英数字。後ろが日本語なら取り込まない） */
function isBechChar(c: string): boolean {
  return (c >= "0" && c <= "9") || (c >= "a" && c <= "z");
}

function isTagChar(c: string): boolean {
  return isLetterOrDigit(c) || c === "_";
}

/** 空白までを URL とし、末尾の句読点・閉じ括弧は URL から外す */
function urlEndOf(s: string, start: number): number {
  let e = start;
  while (e < s.length && !isWhitespace(s[e])) e++;
  while (e > start && URL_TAIL.includes(s[e - 1])) e--;
  return e;
}

/** start から続く bech32 文字列の終端 */
function bechEndOf(s: string, start: number): number {
  let e = start;
  while (e < s.length && isBechChar(s[e])) e++;
  return e;
}

function entityPrefixAt(s: string, i: number): boolean {
  return ENTITY_PREFIXES.some((prefix) => s.startsWith(prefix, i));
}

/** 素の（nostr: なしの）参照の先頭か。語中を拾わないよう、直前が ASCII 英数字なら対象外 */
function bareEntityAt(s: string, i: number): boolean {
  if (i > 0 && isAsciiAlnum(s[i - 1])) return false;
  return entityPrefixAt(s, i);
}

/** start は ':'。:shortcode: の閉じ ':' の位置（無効なら -1） */
function shortcodeEndOf(s: string, start: number): number {
  let j = start + 1;
  while (j < s.length && (isLetterOrDigit(s[j]) || s[j] === "_" || s[j] === "-")) j++;
  return j < s.length && s[j] === ":" && j > start + 1 ? j : -1;
}

function tokenAt(text: string, i: number): ContentToken | null {
  const n = text.length;
  if (text.startsWith("http://", i) || text.startsWith("https://", i)) {
    const end = urlEndOf(text, i);
    return { type: "url", url: text.slice(i, end), start: i, end };
  }
  if (text.startsWith("nostr:", i) && i + 6 < n && isBechChar(text[i + 6]) && entityPrefixAt(text, i + 6)) {
    const end = bechEndOf(text, i + 6);
    return { type: "nostr", bech: text.slice(i + 6, end), hadPrefix: true, start: i, end };
  }
  if (bareEntityAt(text, i)) {
    const end = bechEndOf(text, i);
    return { type: "nostr", bech: text.slice(i, end), hadPrefix: false, start: i, end };
  }
  if (text[i] === "#" && i + 1 < n && isTagChar(text[i + 1])) {
    let j = i + 1;
    while (j < n && isTagChar(text[j])) j++;
    return { type: "hashtag", tag: text.slice(i + 1, j), start: i, end: j };
  }
  if (text[i] === ":") {
    const close = shortcodeEndOf(text, i);
    if (close > 0) return { type: "emoji", code: text.slice(i + 1, close), start: i, end: close + 1 };
  }
  return null;
}

/**
 * text を位置付きのトークン列にする。続く非トークン文字は 1 つの text にまとめる。
 * 各位置で URL → nostr: 付き参照 → 素の参照 → #タグ → :shortcode: の順に試す（ネイティブと同じ）。
 */
export function tokenizeNostrContent(text: string): ContentToken[] {
  const out: ContentToken[] = [];
  let i = 0;
  let textStart = 0;
  while (i < text.length) {
    const token = tokenAt(text, i);
    if (token) {
      if (token.start > textStart) out.push({ type: "text", start: textStart, end: token.start });
      out.push(token);
      i = token.end;
      textStart = i;
    } else {
      i++;
    }
  }
  if (text.length > textStart) out.push({ type: "text", start: textStart, end: text.length });
  return out;
}
