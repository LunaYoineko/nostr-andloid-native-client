import { npubEncode } from "nostr-tools/nip19";
import { useMemo, useState } from "react";
import { displayName, pictureOf, useProfile } from "../../nostr/loaders";
import { useSession } from "../../signer/session";
import { showToast } from "../../ui/toast";
import { Lightbox } from "../media/Lightbox";
import { FollowButton } from "../profile/FollowButton";
import { Nip05Handle } from "../profile/Nip05Handle";
import { usePinnedPosts } from "../profile/pinnedPosts";
import { Avatar, NoteItem } from "../timeline/NoteItem";
import styles from "./ProfileColumnHeader.module.css";
import { useFollows } from "./useFollows";

/** コピーしたことを見せておく時間 */
const COPIED_MS = 1_500;

/**
 * PROFILE カラムの上部カード（ネイティブ ProfileColumn.kt の ProfileHeaderCard、105–）。
 * アバター 60px（押すとライトボックス）・名前（無ければ hex 先頭 10 文字）・NIP-05・フォローボタン・
 * npub（押すとコピー）・固定投稿（#531。その人の kind:10001。「📌 固定された投稿」付き、ProfilePostList と同じ文言）。
 * Timeline の header として投稿一覧の先頭に渡す（スマホで画面を占有しないよう、他の投稿と同じスクロール領域を
 * 一緒にスクロールする。ネイティブの LazyColumn の先頭項目と同じ）。
 */
export function ProfileColumnHeader({ pubkey }: { pubkey: string }) {
  const me = useSession((s) => s.pubkey);
  const myFollows = useFollows(me);
  const following = myFollows?.includes(pubkey) ?? false;
  const profile = useProfile(pubkey);
  const picture = pictureOf(profile);
  const name = displayName(profile, pubkey);
  const nip05 =
    typeof profile?.nip05 === "string" && profile.nip05.trim() !== "" ? profile.nip05.trim() : null;
  const npub = useMemo(() => npubEncode(pubkey), [pubkey]);
  const pinnedPosts = usePinnedPosts(pubkey);
  const [zoom, setZoom] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyNpub() {
    try {
      await navigator.clipboard.writeText(npub);
    } catch {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <div className={styles.card}>
      <div className={styles.row}>
        {picture ? (
          <button
            type="button"
            className={styles.avatarButton}
            aria-label="画像を表示"
            onClick={() => setZoom(true)}
          >
            <Avatar key={picture} url={picture} size="xl" seed={name} pubkey={pubkey} />
          </button>
        ) : (
          <Avatar key={picture} url={picture} size="xl" seed={name} pubkey={pubkey} />
        )}
        <div className={styles.texts}>
          <p className={styles.name}>{name}</p>
          {nip05 && <Nip05Handle pubkey={pubkey} nip05={nip05} size="caption" />}
        </div>
        {me && <FollowButton me={me} target={pubkey} following={following} onError={showToast} />}
      </div>
      <button type="button" className={styles.npub} onClick={copyNpub}>
        {copied ? "コピーしました" : `${npub.slice(0, 20)}…${npub.slice(-6)}`}
      </button>
      {pinnedPosts.length > 0 && (
        <div className={styles.pinned}>
          <p className={styles.pinnedLabel}>
            <span aria-hidden="true">📌</span> 固定された投稿
          </p>
          {pinnedPosts.map((event) => (
            <NoteItem key={event.id} event={event} />
          ))}
        </div>
      )}
      {zoom && picture && <Lightbox items={[{ url: picture }]} index={0} onClose={() => setZoom(false)} />}
    </div>
  );
}
