/**
 * 入力補完（純関数。ネイティブ ComposeSheet.kt の activeTagPrefix / activeMention / activeEmoji と
 * insertAtCursor 以下の移植）。カーソルは挿入・置換した文字列の末尾へ移す。
 */

/** 本文とカーソル位置（UTF-16 の位置 = textarea の selectionStart） */
export type TextState = { text: string; cursor: number };

const LETTER_OR_DIGIT = /[\p{L}\p{Nd}]/u;
const WHITESPACE = /\s/;

function allChars(s: string, ok: (c: string) => boolean): boolean {
  for (const c of s) if (!ok(c)) return false;
  return true;
}

/** カーソル直前の "#断片"（文字・数字・_ だけ。空も可）を小文字で。無ければ null */
export function activeTagPrefix(before: string): string | null {
  const idx = before.lastIndexOf("#");
  if (idx < 0) return null;
  const frag = before.slice(idx + 1);
  return allChars(frag, (c) => LETTER_OR_DIGIT.test(c) || c === "_") ? frag.toLowerCase() : null;
}

/** カーソル直前の "@断片"（直前が空白か先頭、以降が 文字・数字・_ . で 1 文字以上）。無ければ null */
export function activeMention(before: string): string | null {
  const idx = before.lastIndexOf("@");
  if (idx < 0) return null;
  if (idx > 0 && !WHITESPACE.test(before[idx - 1])) return null;
  const frag = before.slice(idx + 1);
  return frag !== "" && allChars(frag, (c) => LETTER_OR_DIGIT.test(c) || c === "_" || c === ".")
    ? frag
    : null;
}

/** カーソル直前の ":断片"（直前が空白か先頭 = http:// 等を拾わない。以降が 文字・数字・_+- で 1 文字以上） */
export function activeEmoji(before: string): string | null {
  const idx = before.lastIndexOf(":");
  if (idx < 0) return null;
  if (idx > 0 && !WHITESPACE.test(before[idx - 1])) return null;
  const frag = before.slice(idx + 1);
  return frag !== "" && allChars(frag, (c) => LETTER_OR_DIGIT.test(c) || "_+-".includes(c)) ? frag : null;
}

function clampCursor(s: TextState): number {
  return Math.min(Math.max(s.cursor, 0), s.text.length);
}

/** カーソル位置に str を挿入する */
export function insertAtCursor(s: TextState, str: string): TextState {
  const cur = clampCursor(s);
  return { text: s.text.slice(0, cur) + str + s.text.slice(cur), cursor: cur + str.length };
}

/** カーソル直前の trigger 以降を replacement で置き換える（trigger が無ければ挿入） */
export function replaceTokenBeforeCursor(s: TextState, trigger: string, replacement: string): TextState {
  const cur = clampCursor(s);
  const idx = s.text.slice(0, cur).lastIndexOf(trigger);
  if (idx < 0) return insertAtCursor(s, replacement);
  return { text: s.text.slice(0, idx) + replacement + s.text.slice(cur), cursor: idx + replacement.length };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** カーソル位置に "#tag " を足す（直前が空白・改行・先頭でなければ空白を挟む）。本文に既にあれば何もしない */
export function appendHashtag(s: TextState, tag: string): TextState {
  if (new RegExp(`(^|\\s)#${escapeRegExp(tag)}(\\s|$)`).test(s.text)) return s;
  const cur = clampCursor(s);
  const prev = cur > 0 ? s.text[cur - 1] : undefined;
  const sep = prev === undefined || prev === " " || prev === "\n" ? "" : " ";
  return insertAtCursor(s, `${sep}#${tag} `);
}

/** 入力中の "#…" を "#tag " に */
export function completeHashtag(s: TextState, tag: string): TextState {
  return replaceTokenBeforeCursor(s, "#", `#${tag} `);
}

/** 入力中の "@…" を "nostr:<npub> " に */
export function completeMention(s: TextState, npub: string): TextState {
  return replaceTokenBeforeCursor(s, "@", `nostr:${npub} `);
}

/** 入力中の ":…" を ":shortcode: " に */
export function insertEmojiShortcode(s: TextState, shortcode: string): TextState {
  return replaceTokenBeforeCursor(s, ":", `:${shortcode}: `);
}
