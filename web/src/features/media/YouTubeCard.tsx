import { useState } from "react";
import { useYouTubeInfo } from "../linkcard/youtubeInfo";
import styles from "./YouTubeCard.module.css";

/**
 * YouTube のサムネカード（ネイティブの LinkEmbeds.kt の iframe 非対応経路）。押すと新しいタブで YouTube を開く。
 * サムネは img.youtube.com から直接読む（プロキシは通さない。読めなければ黒地のまま）。
 * 上端にタイトル帯（/api/oembed のタイトル + チャンネル名。取れたときだけ。サムネに重ねるので高さは変わらない）。
 * インライン再生（youtube-nocookie の iframe）はまだ出さない。
 */
export function YouTubeCard({ url, id }: { url: string; id: string }) {
  const [failed, setFailed] = useState(false);
  const info = useYouTubeInfo(id);
  return (
    <a
      className={styles.card}
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      aria-label="YouTube で開く"
    >
      <img
        className={failed ? `${styles.thumb} ${styles.hidden}` : styles.thumb}
        src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
      {/* 公式埋め込みの上部バー相当（グラデーションは使わず半透明の単色帯。ネイティブと同じ） */}
      {info && (
        <span className={styles.band}>
          <span className={styles.bandTitle}>{info.title}</span>
          {info.author.trim() !== "" && <span className={styles.bandAuthor}>{info.author}</span>}
        </span>
      )}
      {/* YouTube 標準の再生ボタン（ブランド色なのでモノクロの原則の例外。ネイティブと同じ）。U+FE0E で絵文字にしない */}
      <span className={styles.play} aria-hidden="true">
        {"▶︎"}
      </span>
      <span className={styles.logo}>YouTube</span>
    </a>
  );
}
