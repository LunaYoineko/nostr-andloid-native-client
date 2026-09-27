import { useState } from "react";
import { proxied } from "../../lib/imageProxy";
import styles from "./LinkCard.module.css";
import type { OgpData } from "./ogpParser";
import type { LinkCardState } from "./useLinkCards";

/** サムネのプロキシ幅（ネイティブ LinkEmbeds.kt OgpEmbed。表示 88px の 3.5 倍でも足りる幅） */
const THUMB_PROXY_WIDTH = 300;

/** 表示用のホスト名（先頭の www. は落とす。ネイティブ LinkEmbeds.kt hostOf と同じ） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

/**
 * OGP のリンクカード（ネイティブ LinkEmbeds.kt OgpEmbed）。左に 88px のサムネ、右にサイト名（無ければドメイン）・
 * タイトル 2 行・説明 2 行・URL 1 行。全体が新しいタブで開く外部リンク。サムネが読めなければ出さない。
 * OGP の各項目は文字として描く（HTML として解釈しない）。
 */
export function LinkCard({ url, ogp }: { url: string; ogp: OgpData }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = ogp.image && !imageFailed ? proxied(ogp.image, THUMB_PROXY_WIDTH) : null;
  return (
    <a className={styles.card} href={url} target="_blank" rel="noopener noreferrer nofollow ugc">
      {image && (
        <img
          className={styles.thumb}
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      )}
      <span className={styles.body}>
        <span className={styles.site}>{ogp.siteName ?? hostOf(url)}</span>
        {ogp.title && <span className={styles.title}>{ogp.title}</span>}
        {ogp.description && <span className={styles.description}>{ogp.description}</span>}
        <span className={styles.url}>{url}</span>
      </span>
    </a>
  );
}

/** 取得中の枠（本文のリンクはまだ畳んでいないので、読み上げには出さない） */
function LinkCardPlaceholder({ url }: { url: string }) {
  return (
    <div className={`${styles.card} ${styles.placeholder}`} aria-hidden="true">
      <span className={styles.body}>
        <span className={styles.site}>{hostOf(url)}</span>
      </span>
    </div>
  );
}

/**
 * 投稿のリンクカードの列（NoteItem のメディアの下）。取得中は枠だけ、取れなかった（null）ものは出さない
 * （本文のリンクがそのまま残る）。出すものが無ければ何も描かない。
 */
export function LinkCards({ cards }: { cards: LinkCardState[] }) {
  const visible = cards.filter((card) => card.ogp !== null);
  if (visible.length === 0) return null;
  return (
    <div className={styles.cards}>
      {visible.map(({ url, ogp }) =>
        ogp ? <LinkCard key={url} url={url} ogp={ogp} /> : <LinkCardPlaceholder key={url} url={url} />,
      )}
    </div>
  );
}
