import { eolMetadata, type Root } from "applesauce-content/nast";
import { emojis, getParsedContent, links, nostrMentions } from "applesauce-content/text";
import type { NostrEvent } from "nostr-tools/pure";
import { hashtagsAny } from "../../lib/content/parse";

/** 自己紹介の構文木のキャッシュキー（kind:0 のイベントごと） */
export const ABOUT_CONTENT_KEY = Symbol.for("nostrism.profile-about");

/**
 * 自己紹介（kind:0 の about）の構文木。URL・メンション・#タグをリンクにし、kind:0 の emoji タグで
 * カスタム絵文字を出す。画像の URL も取り除かずリンクのまま（ネイティブの about と同じ）。
 */
export function parseAbout(profileEvent: NostrEvent, about: string): Root {
  return getParsedContent(
    profileEvent,
    about,
    [links, nostrMentions, emojis, hashtagsAny, eolMetadata],
    ABOUT_CONTENT_KEY,
  );
}
