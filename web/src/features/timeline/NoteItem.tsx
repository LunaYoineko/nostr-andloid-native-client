import type { NostrEvent } from "nostr-tools/pure";
import { memo, useState } from "react";
import { markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { relativeTime } from "../../lib/time";
import { displayName, pictureOf, useProfile, useRepostedEvent } from "../../nostr/loaders";
import { NoteContent } from "./NoteContent";
import styles from "./NoteItem.module.css";

/** アバターのプロキシ幅（表示 38px の約 2.5 倍。リポストヘッダの 16px でも同じ URL を使いキャッシュを共有する） */
const AVATAR_PROXY_WIDTH = 96;

/**
 * タイムラインの 1 件（暫定）。アバター・表示名・相対時刻・本文。
 * kind:6/16 は「〜がリポスト」の行を付けて元投稿を出す。
 */
export const NoteItem = memo(function NoteItem({ event }: { event: NostrEvent }) {
  if (event.kind === 6 || event.kind === 16) return <RepostItem repost={event} />;
  return (
    <article className={styles.note}>
      <NoteBody event={event} />
    </article>
  );
});

function RepostItem({ repost }: { repost: NostrEvent }) {
  const reposter = useProfile(repost.pubkey);
  const original = useRepostedEvent(repost);
  const picture = pictureOf(reposter);
  return (
    <article className={styles.note}>
      <p className={styles.repostHeader}>
        <RepostIcon />
        <Avatar key={picture} url={picture} size="sm" />
        <span className={styles.repostName}>{displayName(reposter, repost.pubkey)}</span>
        <span className={styles.repostLabel}>がリポスト</span>
      </p>
      {original ? <NoteBody event={original} /> : <p className={styles.missing}>元の投稿を読み込み中…</p>}
    </article>
  );
}

function NoteBody({ event }: { event: NostrEvent }) {
  const profile = useProfile(event.pubkey);
  const picture = pictureOf(profile);
  const createdAt = new Date(event.created_at * 1000);
  // created_at は任意の数値なので、Date の範囲外なら属性を付けない（toISOString が例外を投げる）
  const valid = Number.isFinite(createdAt.getTime());
  return (
    <div className={styles.row}>
      <Avatar key={picture} url={picture} size="md" />
      <div className={styles.main}>
        <div className={styles.meta}>
          <span className={styles.name}>{displayName(profile, event.pubkey)}</span>
          <time
            className={styles.time}
            dateTime={valid ? createdAt.toISOString() : undefined}
            title={valid ? createdAt.toLocaleString() : undefined}
          >
            {relativeTime(event.created_at)}
          </time>
        </div>
        <NoteContent event={event} />
      </div>
    </div>
  );
}

/** wsrv.nl を通した画像 URL。http(s) 以外は出さない */
function avatarSrc(url: string | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url.trim())) return null;
  return proxied(url, AVATAR_PROXY_WIDTH);
}

/**
 * アバター。プロキシが読めなければ元 URL（https のみ）で 1 度だけ取り直し、そのホストを拒否として学習する。
 * url が変わったら呼び出し側の key で作り直す。
 */
function Avatar({ url, size }: { url: string | undefined; size: "md" | "sm" }) {
  const [src, setSrc] = useState(() => avatarSrc(url));
  const className = size === "md" ? styles.avatar : styles.avatarSm;
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

function RepostIcon() {
  return (
    <svg className={styles.repostIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" fill="currentColor" />
    </svg>
  );
}
