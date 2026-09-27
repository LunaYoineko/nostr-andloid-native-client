import type { EventPointer } from "applesauce-core/helpers/pointers";
import type { NostrEvent } from "nostr-tools/pure";
import { useState } from "react";
import { Link } from "react-router";
import { hrefForEvent } from "../../lib/content/labels";
import { isBlankContent, parseNoteContent } from "../../lib/content/parse";
import { contentWarningOf } from "../../lib/content/tags";
import { markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { extractMedia } from "../../lib/media";
import { displayName, pictureOf, useEventByPointer, useProfile } from "../../nostr/loaders";
import { PlayCircleIcon } from "../../ui/icons";
import { NoteContent } from "./NoteContent";
import { Avatar } from "./NoteItem";
import styles from "./QuoteCard.module.css";

/**
 * 引用元のカード（ネイティブの QuotedNoteCard.kt）。カード全体が引用元へのリンク。
 * カード内のリンク・メンション・タグは装飾だけにし、入れ子の引用カードは出さない（1 段）。
 */
export function QuoteCard({ pointer, encoded }: { pointer: EventPointer; encoded: string | null }) {
  const quoted = useEventByPointer(pointer);
  if (!quoted) return <p className={`${styles.quote} ${styles.loading}`}>引用元を読み込み中…</p>;
  return (
    <Link className={styles.quote} to={hrefForEvent(encoded ?? pointer)} aria-label="引用元の投稿を開く">
      <QuotedNote quoted={quoted} />
    </Link>
  );
}

function QuotedNote({ quoted }: { quoted: NostrEvent }) {
  const profile = useProfile(quoted.pubkey);
  const picture = pictureOf(profile);
  return (
    <>
      <span className={styles.header}>
        <Avatar key={picture} url={picture} size="sm" />
        <span className={styles.name}>{displayName(profile, quoted.pubkey)}</span>
      </span>
      {contentWarningOf(quoted) !== null ? (
        // ネイティブは CW を無視するが、Web はカードでは隠す（開いて読む）
        <span className={styles.warning}>センシティブな内容</span>
      ) : (
        <>
          {!isBlankContent(parseNoteContent(quoted)) && (
            <div className={styles.body}>
              <NoteContent event={quoted} variant="quote" />
            </div>
          )}
          <QuoteMedia event={quoted} />
        </>
      )}
    </>
  );
}

/** 画像 → 動画の順に横スクロールで並べる（カード内では再生・拡大しない。YouTube は出さない） */
function QuoteMedia({ event }: { event: NostrEvent }) {
  const { images, videos } = extractMedia(event);
  const count = images.length + videos.length;
  if (count === 0) return null;
  const itemClass = `${styles.item} ${count === 1 ? styles.single : styles.multi}`;
  return (
    <span className={styles.media}>
      {images.map((image) => (
        <QuoteImage key={image.url} className={itemClass} url={image.url} alt={image.alt ?? ""} />
      ))}
      {videos.map((video) => (
        <span key={video.url} className={`${itemClass} ${styles.video}`}>
          <PlayCircleIcon className={styles.play} />
          <span className={styles.videoLabel}>動画</span>
        </span>
      ))}
    </span>
  );
}

/**
 * 引用カードの画像。プロキシが読めなければ元 URL（https のみ）で 1 度だけ取り直し、そのホストを拒否として学習する
 * （Avatar と同じ）。それも読めなければ空の枠にする。
 */
function QuoteImage({ className, url, alt }: { className: string; url: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(() => proxied(url, 640, 80));
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
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}
