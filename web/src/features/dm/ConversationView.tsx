import type { NostrEvent } from "nostr-tools/pure";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { DmMessageRow } from "../../db/schema";
import { hrefForProfile } from "../../lib/content/labels";
import { extractMedia } from "../../lib/media";
import { shortNpub } from "../../lib/npub";
import { formatAbsoluteTime } from "../../lib/time";
import { displayName, pictureOf, useProfile } from "../../nostr/loaders";
import { ArrowBackIcon } from "../../ui/icons";
import { NoteMedia } from "../media/NoteMedia";
import { NoteContent } from "../timeline/NoteContent";
import { Avatar } from "../timeline/NoteItem";
import styles from "./ConversationView.module.css";
import { markSeen } from "./dmSeen";
import { useConversations, useDm, useMessagesWith } from "./dmStore";

/** 1 度に出す件数（新しい方から。古いものは「さらに表示」で足す） */
const PAGE_SIZE = 200;
/** 同じ送り手でこの秒数未満の連投は名前・アバターを省く（ネイティブ continuation） */
const CONTINUATION_SEC = 300;

/**
 * 相手との会話（ネイティブ DmScreen の会話側）。最新が下。
 * スクロール領域は column-reverse で下端に揃える（DOM は新しい順。ネイティブの reverseLayout と同じで、
 * 読み込み後に最下部へ飛ばす処理は書かない）。onBack があれば（Compact）「←」を出す。
 */
export function ConversationView({ peer, onBack }: { peer: string; onBack?: () => void }) {
  const me = useDm((s) => s.owner);
  const messages = useMessagesWith(peer);
  const conversation = useConversations().find((c) => c.peer === peer);
  const unread = conversation?.unread ?? 0;
  const lastIncomingAt = conversation?.lastIncomingAt ?? 0;
  // 開いている会話は既読にする（開いたとき・開いている間の新着。未読が 0 なら何もしない。ネイティブ #416）
  useEffect(() => {
    if (me !== null && unread > 0) markSeen(me, peer, lastIncomingAt);
  }, [me, peer, unread, lastIncomingAt]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const profile = useProfile(peer);
  const picture = pictureOf(profile);
  const name = displayName(profile, peer);

  const start = Math.max(0, messages.length - limit);
  // DOM は新しい順（column-reverse で下から積む）
  const rows: ReactNode[] = [];
  for (let i = messages.length - 1; i >= start; i--) {
    const message = messages[i];
    const prev = i > 0 ? messages[i - 1] : undefined;
    const continuation =
      prev !== undefined &&
      prev.sender === message.sender &&
      message.createdAt - prev.createdAt < CONTINUATION_SEC;
    rows.push(
      <Bubble key={message.id} message={message} mine={message.sender === me} continuation={continuation} />,
    );
  }

  return (
    <section className={styles.root} aria-label={name}>
      <header className={styles.header}>
        {onBack && (
          <button type="button" className={styles.back} aria-label="戻る" onClick={onBack}>
            <ArrowBackIcon className={styles.backIcon} />
          </button>
        )}
        <Link className={styles.peer} to={hrefForProfile(peer)}>
          <Avatar key={picture} url={picture} size="lg" seed={name} />
          <span className={styles.peerTexts}>
            <h2 className={styles.peerName}>{name}</h2>
            <span className={styles.peerNpub}>{shortNpub(peer)}</span>
          </span>
        </Link>
      </header>
      <div className={styles.scroller}>
        {rows}
        {start > 0 && (
          <button type="button" className={styles.more} onClick={() => setLimit((n) => n + PAGE_SIZE)}>
            さらに表示
          </button>
        )}
      </div>
    </section>
  );
}

/** 吹き出し。自分 = 右寄せ、相手 = 左寄せ + アバター（連投は省く） */
function Bubble({
  message,
  mine,
  continuation,
}: {
  message: DmMessageRow;
  mine: boolean;
  continuation: boolean;
}) {
  // 本文の描画用に kind:14 のイベントの形にする（EventStore には入れない）
  const event = useMemo<NostrEvent>(
    () => ({
      id: message.id,
      pubkey: message.sender,
      kind: 14,
      created_at: message.createdAt,
      content: message.content,
      tags: message.tags,
      sig: "",
    }),
    [message],
  );
  const media = extractMedia(event);
  const hasMedia = media.images.length + media.videos.length + media.youtube.length > 0;
  const showSender = !mine && !continuation;
  return (
    <div className={mine ? styles.mine : styles.theirs} data-continuation={continuation || undefined}>
      {!mine &&
        (showSender ? <SenderAvatar pubkey={message.sender} /> : <span className={styles.avatarGap} />)}
      <div className={styles.column}>
        {showSender && <SenderName pubkey={message.sender} />}
        <div className={styles.bubble}>
          <NoteContent event={event} />
          {hasMedia && <NoteMedia media={media} />}
        </div>
        <span className={styles.time}>{formatAbsoluteTime(message.createdAt)}</span>
      </div>
    </div>
  );
}

function SenderAvatar({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const picture = pictureOf(profile);
  return (
    <span className={styles.avatar}>
      <Avatar key={picture} url={picture} size="md" seed={displayName(profile, pubkey)} />
    </span>
  );
}

function SenderName({ pubkey }: { pubkey: string }) {
  return <span className={styles.sender}>{displayName(useProfile(pubkey), pubkey)}</span>;
}
