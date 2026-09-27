import type { EventPointer } from "applesauce-core/helpers/pointers";
import { neventEncode, npubEncode } from "nostr-tools/nip19";

/** 引用カード内の URL 表示の最大長（ネイティブの ContentText.kt shortUrlLabel と同じ） */
const SHORT_URL_MAX = 28;

/** 改行・タブ・全角空白・連続空白を 1 つの半角空白に潰して 1 行にする（ネイティブの ReplyContextLine.kt oneLine） */
export function oneLine(s: string): string {
  return s
    .replace(/　/g, " ")
    .replace(/[\n\r\t]/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** スキームと www. を除き、28 文字を超えたら切り詰めて … を付ける */
export function shortUrlLabel(url: string): string {
  let label = url;
  for (const prefix of ["https://", "http://", "www."]) {
    if (label.startsWith(prefix)) label = label.slice(prefix.length);
  }
  return label.length > SHORT_URL_MAX ? `${label.slice(0, SHORT_URL_MAX)}…` : label;
}

/**
 * NIP-19 参照の表示（ネイティブの ContentText.kt mentionLabel）。
 * npub / nprofile は @名前（無ければ bech32 の先頭 12 文字 + …）、note / nevent / naddr は ↗ + 先頭 12 文字 + …。
 */
export function mentionLabel(encoded: string, name?: string): string {
  const short = `${encoded.slice(0, 12)}…`;
  if (encoded.startsWith("npub1") || encoded.startsWith("nprofile1")) return name ? `@${name}` : `@${short}`;
  if (encoded.startsWith("note1") || encoded.startsWith("nevent1") || encoded.startsWith("naddr1")) {
    return `↗${short}`;
  }
  return encoded;
}

// アプリ内のリンク先（basename の /app は Router が付ける）
export function hrefForProfile(pubkey: string): string {
  return `/p/${npubEncode(pubkey)}`;
}

export function hrefForEvent(encodedOrPointer: string | EventPointer): string {
  return `/e/${typeof encodedOrPointer === "string" ? encodedOrPointer : neventEncode(encodedOrPointer)}`;
}

export function hrefForTag(hashtag: string): string {
  return `/t/${encodeURIComponent(hashtag)}`;
}
