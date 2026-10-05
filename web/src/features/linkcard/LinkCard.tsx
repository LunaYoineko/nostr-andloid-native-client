import { useState } from "react";
import { proxied } from "../../lib/imageProxy";
import { useEmbedPrefs } from "./embedPrefs";
import styles from "./LinkCard.module.css";
import type { OgpData } from "./ogpParser";
import type { LinkCardState } from "./useLinkCards";
import { XPostEmbed } from "./XPostCard";
import { xPostFrom } from "./xPost";

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
 * kind が "spotify" なら、設定の ogpImages に関係なく画像を読む（ネイティブ LinkEmbeds.kt 75 と同じ）。
 */
export function LinkCard({
  url,
  ogp,
  kind = "ogp",
  ogpImages = true,
}: {
  url: string;
  ogp: OgpData;
  kind?: "ogp" | "spotify";
  ogpImages?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = kind === "spotify" || ogpImages;
  const image = showImage && ogp.image && !imageFailed ? proxied(ogp.image, THUMB_PROXY_WIDTH) : null;
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
 * X の投稿 URL で本文が取れたものは、リンクカードではなく X の投稿カード（#744）。本文が無い・削除済みは従来のカード。
 */
export function LinkCards({ cards }: { cards: LinkCardState[] }) {
  const ogpImages = useEmbedPrefs((s) => s.ogpImages);
  const visible = cards.filter((card) => card.ogp !== null);
  if (visible.length === 0) return null;
  return (
    <div className={styles.cards}>
      {visible.map(({ url, kind, ogp }) => {
        if (!ogp) return <LinkCardPlaceholder key={url} url={url} />;
        const post = kind === "ogp" ? xPostFrom(url, ogp) : null;
        return post ? (
          <XPostEmbed key={url} post={post} ogpImages={ogpImages} />
        ) : (
          <LinkCard key={url} url={url} ogp={ogp} kind={kind} ogpImages={ogpImages} />
        );
      })}
    </div>
  );
}
