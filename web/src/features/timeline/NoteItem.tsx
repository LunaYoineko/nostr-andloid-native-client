import { getSeenRelays } from "applesauce-core/helpers/relays";
import type { NostrEvent } from "nostr-tools/pure";
import { memo, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { hrefForEvent, hrefForProfile } from "../../lib/content/labels";
import { isBlankContent, parseNoteContent, withoutMention } from "../../lib/content/parse";
import { clientNameOf, contentWarningOf, quotePointerOf } from "../../lib/content/tags";
import { markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { extractMedia } from "../../lib/media";
import { relativeTime } from "../../lib/time";
import { displayName, pictureOf, useEventByPointer, useProfile, useRepostedEvent } from "../../nostr/loaders";
import { NoteActionButtons } from "../actions/NoteActionButtons";
import { NoteFooter } from "../compose/NoteFooter";
import { NoteMedia } from "../media/NoteMedia";
import { CollapsibleContent } from "./CollapsibleContent";
import { ContentWarning } from "./ContentWarning";
import { NoteContent } from "./NoteContent";
import styles from "./NoteItem.module.css";
import { QuoteCard } from "./QuoteCard";
import { ReplyContext } from "./ReplyContext";
import { RepostHeader } from "./RepostHeader";
import { useNow } from "./useNow";
import { useOpenOnClick } from "./useOpenOnClick";

/** アバターのプロキシ幅（表示 38px の約 2.5 倍。リポストヘッダの 16px でも同じ URL を使いキャッシュを共有する） */
const AVATAR_PROXY_WIDTH = 96;

/**
 * タイムラインの 1 件（ネイティブの NoteItem.kt）。返信先の 1 行・アバター・表示名・NIP-05・相対時刻・本文・引用カード。
 * kind:6/16 は「🔁 (アバター) 名前」の行を付けて元投稿を出す。
 * openable（既定 true）なら全体のクリックと時刻のリンクでスレッドを開く（スレッドの行では false）。
 */
export const NoteItem = memo(function NoteItem({
  event,
  openable = true,
}: {
  event: NostrEvent;
  openable?: boolean;
}) {
  if (event.kind === 6 || event.kind === 16) return <RepostItem repost={event} openable={openable} />;
  return <PostItem event={event} openable={openable} />;
});

function PostItem({ event, openable }: { event: NostrEvent; openable: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const href = openable ? threadHrefOf(event) : null;
  useOpenOnClick(ref, href);
  return (
    <article ref={ref} className={href ? `${styles.note} ${styles.openable}` : styles.note}>
      <NoteBody event={event} threadHref={href} />
    </article>
  );
}

function RepostItem({ repost, openable }: { repost: NostrEvent; openable: boolean }) {
  const original = useRepostedEvent(repost);
  const ref = useRef<HTMLElement>(null);
  // 開く先は元投稿（未解決の間は開かない）
  const href = openable && original ? threadHrefOf(original) : null;
  useOpenOnClick(ref, href);
  return (
    <article ref={ref} className={href ? `${styles.note} ${styles.openable}` : styles.note}>
      <RepostHeader reposter={repost.pubkey} />
      {original ? (
        <NoteBody event={original} threadHref={href} />
      ) : (
        <p className={styles.missing}>元の投稿を読み込み中…</p>
      )}
    </article>
  );
}

/** スレッドを開くリンク先。受け取ったリレーを 2 件までヒントに付ける */
function threadHrefOf(target: NostrEvent): string {
  const seen = [...(getSeenRelays(target) ?? [])].slice(0, 2);
  return hrefForEvent(
    seen.length > 0
      ? { id: target.id, author: target.pubkey, relays: seen }
      : { id: target.id, author: target.pubkey },
  );
}

function NoteBody({ event, threadHref }: { event: NostrEvent; threadHref: string | null }) {
  const profile = useProfile(event.pubkey);
  const picture = pictureOf(profile);
  const nip05 =
    typeof profile?.nip05 === "string" && profile.nip05.trim() !== "" ? profile.nip05.trim() : null;
  const profileHref = hrefForProfile(event.pubkey);

  // CW の開封はこの表示の間だけ覚える
  const [revealed, setRevealed] = useState(false);
  const warning = contentWarningOf(event);

  // 本文中の参照は、引用元が取れてカードに出せたときだけ本文から消す（取れない間は ↗ のリンクのまま）
  const quote = useMemo(() => quotePointerOf(event), [event]);
  const quoted = useEventByPointer(quote?.pointer ?? null);
  const hideMention = quoted ? (quote?.encoded ?? null) : null;
  const hasText = useMemo(
    () => !isBlankContent(withoutMention(parseNoteContent(event), hideMention)),
    [event, hideMention],
  );
  const media = extractMedia(event);
  const hasMedia = media.images.length + media.videos.length + media.youtube.length > 0;

  return (
    <>
      <ReplyContext event={event} />
      <div className={styles.row}>
        {/* 名前と同じリンク先なので、読み上げ・タブ移動は名前の方だけにする */}
        <Link className={styles.avatarLink} to={profileHref} tabIndex={-1} aria-hidden="true">
          <Avatar key={picture} url={picture} size="md" />
        </Link>
        <div className={styles.main}>
          <div className={styles.meta}>
            <span className={styles.author}>
              <Link className={styles.name} to={profileHref}>
                {displayName(profile, event.pubkey)}
              </Link>
              {nip05 && <span className={styles.handle}>{nip05}</span>}
            </span>
            {threadHref ? (
              <Link to={threadHref} className={styles.timeLink}>
                <RelativeTime createdAt={event.created_at} client={clientNameOf(event)} />
              </Link>
            ) : (
              <RelativeTime createdAt={event.created_at} client={clientNameOf(event)} />
            )}
          </div>
          {warning !== null && !revealed ? (
            <ContentWarning reason={warning} onReveal={() => setRevealed(true)} />
          ) : (
            <>
              {hasText && (
                <CollapsibleContent event={event}>
                  <NoteContent event={event} hideMention={hideMention} />
                </CollapsibleContent>
              )}
              {quote && <QuoteCard pointer={quote.pointer} encoded={quote.encoded} />}
              {hasMedia && <NoteMedia media={media} />}
            </>
          )}
          <NoteFooter event={event}>
            <NoteActionButtons event={event} />
          </NoteFooter>
        </div>
      </div>
    </>
  );
}

/**
 * 相対時刻（30 秒ごとに進む）。title に日時と、client タグがあれば「… · <client> から投稿」を出す
 * （行には出さない = ネイティブと同じ）。
 */
function RelativeTime({ createdAt, client }: { createdAt: number; client: string | null }) {
  const now = useNow();
  const date = new Date(createdAt * 1000);
  // created_at は任意の数値なので、Date の範囲外なら属性を付けない（toISOString が例外を投げる）
  const valid = Number.isFinite(date.getTime());
  const title = valid ? `${date.toLocaleString()}${client ? ` · ${client} から投稿` : ""}` : undefined;
  return (
    <time className={styles.time} dateTime={valid ? date.toISOString() : undefined} title={title}>
      {relativeTime(createdAt, now)}
    </time>
  );
}

/**
 * md = 38px（タイムライン）、sm = 16px（リポストヘッダ）、xs = 20px（リアクションした人の列）、
 * lg = 40px（ユーザー一覧）、xxl = 72px（プロフィール）
 */
export type AvatarSize = "md" | "sm" | "xs" | "lg" | "xxl";

/** プロキシ幅。xxl だけネイティブの Avatar と同じ 256 */
const AVATAR_PROXY: Record<AvatarSize, number> = {
  md: AVATAR_PROXY_WIDTH,
  sm: AVATAR_PROXY_WIDTH,
  xs: AVATAR_PROXY_WIDTH,
  lg: AVATAR_PROXY_WIDTH,
  xxl: 256,
};

const AVATAR_CLASS: Record<AvatarSize, string> = {
  md: styles.avatar,
  sm: styles.avatarSm,
  xs: styles.avatarXs,
  lg: styles.avatarLg,
  xxl: styles.avatarXxl,
};

/** wsrv.nl を通した画像 URL。http(s) 以外は出さない */
function avatarSrc(url: string | undefined, width: number): string | null {
  if (!url || !/^https?:\/\//i.test(url.trim())) return null;
  return proxied(url, width);
}

/**
 * アバター。プロキシが読めなければ元 URL（https のみ）で 1 度だけ取り直し、そのホストを拒否として学習する。
 * url が変わったら呼び出し側の key で作り直す。
 */
export function Avatar({ url, size }: { url: string | undefined; size: AvatarSize }) {
  const [src, setSrc] = useState(() => avatarSrc(url, AVATAR_PROXY[size]));
  const className = AVATAR_CLASS[size];
  if (!src) return <span className={className} aria-hidden="true" />;

  function onError() {
    const origin = originOf(src);
    if (origin) {
      markProxyBlocked(origin);
      setSrc(/^https:\/\//i.test(origin) ? origin : null);
    } else {
      setSrc(null);
    }
  }

  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}
