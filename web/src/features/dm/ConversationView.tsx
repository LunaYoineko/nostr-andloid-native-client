import type { NostrEvent } from "nostr-tools/pure";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { DmMessageRow } from "../../db/schema";
import { hrefForProfile } from "../../lib/content/labels";
import { extractMedia } from "../../lib/media";
import { shortNpub } from "../../lib/npub";
import { formatAbsoluteTime } from "../../lib/time";
import { displayName, pictureOf, useProfile } from "../../nostr/loaders";
import { retryUnsentNow, useIsUnsent } from "../../nostr/publish";
import { ArrowBackIcon } from "../../ui/icons";
import { showToast } from "../../ui/toast";
import { NoteMedia } from "../media/NoteMedia";
import { NoteContent } from "../timeline/NoteContent";
import { Avatar } from "../timeline/NoteItem";
import styles from "./ConversationView.module.css";
import { markSeen } from "./dmSeen";
import { useConversations, useDm, useMessagesWith } from "./dmStore";
import { type DmSendResult, sendDm } from "./send";

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
      <Composer peer={peer} />
    </section>
  );
}

/** 送信結果ごとのトースト（ネイティブ ja リソースと同じ文言。sent / sent-no-peer-relays は別扱い） */
const SEND_FAILURES: Record<Exclude<DmSendResult, "sent" | "sent-no-peer-relays">, string> = {
  failed: "メッセージを送れませんでした",
  "no-nip44": "この拡張機能は NIP-44 に対応していないため、このメッセージを送れません",
  "no-nip04": "この拡張機能は NIP-04 に対応していないため、このメッセージを送れません",
  "no-relays": "送り先のリレーがありません",
};
const NO_PEER_RELAYS_WARN = "相手がDMリレーを公開していないため、届かない可能性があります";

/** 「届かない可能性があります」を出した相手（セッション中 1 回まで） */
const warnedNoPeerRelays = new Set<string>();

/**
 * 会話の入力欄（ネイティブ DmScreen の入力行）。Enter は改行、Ctrl / Cmd + Enter で送信（IME 変換中は送らない）。
 * 送信中は入力と送信を止める。送れたら空にし、送れなければ入力を残してトースト
 */
function Composer({ peer }: { peer: string }) {
  const nip17 = useDm((s) => s.nip17);
  const nip04 = useDm((s) => s.nip04);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const canSend = !sending && text.trim() !== "";

  async function send() {
    if (!canSend) return;
    setSending(true);
    const result = await sendDm(peer, text);
    setSending(false);
    if (result === "sent" || result === "sent-no-peer-relays") {
      setText("");
      if (result === "sent-no-peer-relays" && !warnedNoPeerRelays.has(peer)) {
        warnedNoPeerRelays.add(peer);
        showToast(NO_PEER_RELAYS_WARN);
      }
      return;
    }
    showToast(SEND_FAILURES[result]);
  }

  if (nip17 === "no-nip44" && nip04 === "no-nip04") {
    return <p className={styles.cannotSend}>このログイン方法では DM を送れません</p>;
  }
  return (
    <div className={styles.composer}>
      <textarea
        className={styles.input}
        aria-label="メッセージ"
        rows={1}
        value={text}
        disabled={sending}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <button type="button" className={styles.send} disabled={!canSend} onClick={() => void send()}>
        送信
      </button>
    </div>
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
  const unsent = useIsUnsent(message.id);
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
        {mine && unsent && (
          // 暗号文しか残っていないので「下書きに戻す」は出さない（ネイティブ ChannelRoomColumn の未送信）
          <button type="button" className={styles.unsent} onClick={() => retryUnsentNow(message.id)}>
            未送信・タップで再送
          </button>
        )}
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
