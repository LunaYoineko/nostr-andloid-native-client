import { eolMetadata, type Root } from "applesauce-content/nast";
import { getParsedContent, links } from "applesauce-content/text";
import type { NostrEvent } from "nostr-tools/pure";
import { nativeTokens } from "../../lib/content/parse";

/** 自己紹介の構文木のキャッシュキー（kind:0 のイベントごと） */
export const ABOUT_CONTENT_KEY = Symbol.for("nostrism.profile-about");

/**
 * 自己紹介（kind:0 の about）の構文木。URL をリンクにし、メンション・#タグ・カスタム絵文字は投稿本文と同じ
 * ネイティブ互換のトークナイザ（#479）で拾う（絵文字は kind:0 の emoji タグ）。画像の URL も取り除かずリンクのまま（ネイティブの about と同じ）。
 */
export function parseAbout(profileEvent: NostrEvent, about: string): Root {
  return getParsedContent(
    profileEvent,
    about,
    [links, nativeTokens, eolMetadata],
    ABOUT_CONTENT_KEY,
  );
}
