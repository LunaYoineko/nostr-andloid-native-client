import { useState } from "react";
import styles from "./YouTubeCard.module.css";

/**
 * YouTube のサムネカード（ネイティブの LinkEmbeds.kt の iframe 非対応経路）。押すと新しいタブで YouTube を開く。
 * サムネは img.youtube.com から直接読む（プロキシは通さない。読めなければ黒地のまま）。
 * インライン再生（youtube-nocookie の iframe）とタイトル帯はまだ出さない。
 */
export function YouTubeCard({ url, id }: { url: string; id: string }) {
  const [failed, setFailed] = useState(false);
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
      {/* YouTube 標準の再生ボタン（ブランド色なのでモノクロの原則の例外。ネイティブと同じ）。U+FE0E で絵文字にしない */}
      <span className={styles.play} aria-hidden="true">
        {"▶︎"}
      </span>
      <span className={styles.logo}>YouTube</span>
    </a>
  );
}
