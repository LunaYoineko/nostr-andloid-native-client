import type { NostrEvent } from "nostr-tools/pure";
import { useMemo } from "react";
import { Link } from "react-router";
import { hrefForEvent, mentionLabel, oneLine } from "../../lib/content/labels";
import { parseNoteContent } from "../../lib/content/parse";
import {
  articleTitleOf,
  commentRootLabelOf,
  quotePointerOf,
  replyParentPointerOf,
} from "../../lib/content/tags";
import { displayName, pictureOf, useEventByPointer, useProfile } from "../../nostr/loaders";
import { ReplyIcon } from "../../ui/icons";
import { Avatar } from "./NoteItem";
import styles from "./ReplyContext.module.css";

/** 親の本文を 1 行用の文字にする（画像・動画の URL は除き、参照は短い表記にする） */
function plainText(event: NostrEvent): string {
  let text = "";
  for (const node of parseNoteContent(event).children) {
    if (node.type === "text" || node.type === "link") text += node.value;
    else if (node.type === "hashtag") text += `#${node.name}`;
    else if (node.type === "mention") text += mentionLabel(node.encoded);
    else if (node.type === "emoji") text += node.raw;
  }
  return text;
}

/**
 * 返信先の 1 行「◁ (アバター) 名前: 本文…」（ネイティブの ReplyContextLine.kt）。
 * 親が取れていない間、kind:1 は何も出さず、kind:1111 はコメント対象の文言だけを出す。
 * 引用カードと同じ投稿が親なら二重になるので出さない。
 */
export function ReplyContext({ event }: { event: NostrEvent }) {
  const pointer = useMemo(() => replyParentPointerOf(event), [event]);
  const quoteId = useMemo(() => quotePointerOf(event)?.pointer.id, [event]);
  const parent = useEventByPointer(pointer);
  const profile = useProfile(parent?.pubkey);

  if (pointer && pointer.id === quoteId) return null;

  if (!parent || !pointer) {
    const label = commentRootLabelOf(event);
    if (label === null) return null;
    const content = (
      <>
        <ReplyIcon className={styles.icon} />
        <span className={styles.text}>{label}</span>
      </>
    );
    return pointer ? (
      <Link className={styles.line} to={hrefForEvent(pointer)}>
        {content}
      </Link>
    ) : (
      <p className={styles.line}>{content}</p>
    );
  }

  const name = displayName(profile, parent.pubkey);
  const line = articleTitleOf(parent) ?? (oneLine(plainText(parent)) || oneLine(parent.content));
  if (name === "" && line === "") return null;
  const label = name === "" ? line : line === "" ? name : `${name}: ${line}`;
  const picture = pictureOf(profile);
  return (
    <Link className={styles.line} to={hrefForEvent(pointer)}>
      <ReplyIcon className={styles.icon} />
      <Avatar key={picture} url={picture} size="sm" />
      <span className={styles.text}>{label}</span>
    </Link>
  );
}
