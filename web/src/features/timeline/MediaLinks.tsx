import type { NoteMedia } from "../../lib/media";
import styles from "./MediaLinks.module.css";

/**
 * 本文から取り除いた画像・動画・YouTube の URL を 1 行 1 リンクで出す（暫定。#455 で画像グリッド等に置き換える）。
 * 並びは画像 → 動画 → YouTube（それぞれ本文での出現順）。
 */
export function MediaLinks({ media }: { media: NoteMedia }) {
  const urls = [...media.images, ...media.videos, ...media.youtube].map((item) => item.url);
  return (
    <div className={styles.links}>
      {urls.map((url) => (
        <a
          key={url}
          className={styles.link}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
        >
          {url}
        </a>
      ))}
    </div>
  );
}
