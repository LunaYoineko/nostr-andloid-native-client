import { useState } from "react";
import { useT } from "../../i18n";
import { isDataSaver, markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import type { MediaItem } from "../../lib/media";
import { BlurhashCanvas } from "./BlurhashCanvas";
import styles from "./Thumb.module.css";

/**
 * プロキシが読めなかったときの取り直し先（NoteItem の Avatar と同じ）。
 * プロキシ URL の元が https なら、そのホストを拒否として学習して元 URL を返す。それ以外（2 回目を含む）は null。
 */
export function retrySource(src: string): string | null {
  const origin = originOf(src);
  if (!origin || !/^https:\/\//i.test(origin)) return null;
  markProxyBlocked(origin);
  return origin;
}

type Props = {
  item: MediaItem;
  proxyWidth: number;
  index: number;
  total: number;
  onOpen: (index: number) => void;
  className?: string;
};

/**
 * 投稿画像のサムネ 1 枚（ネイティブの NoteImages.kt Thumb）。押すとライトボックスで開く。
 * blurhash があれば読み込み中 / 失敗時の下敷きにし、読み込めたらフェードで消す。
 * データセーバー中はアニメーション（GIF / アニメ WebP）を先頭フレームだけにする。
 */
export function Thumb({ item, proxyWidth, index, total, onOpen, className }: Props) {
  const t = useT();
  const [src, setSrc] = useState<string | null>(() =>
    /^https?:\/\//i.test(item.url) ? proxied(item.url, proxyWidth, 75, !isDataSaver()) : null,
  );
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  function onError() {
    const retry = src ? retrySource(src) : null;
    if (retry) setSrc(retry);
    else setFailed(true);
  }

  return (
    // 読み込めなくても押せる（ライトボックスで元 URL を取り直す）
    <button
      type="button"
      className={className ? `${styles.thumb} ${className}` : styles.thumb}
      aria-label={t("web_thumb_open", index + 1, total)}
      title={failed && !item.blurhash ? t("img_load_failed") : undefined}
      onClick={() => onOpen(index)}
    >
      {item.blurhash && (
        <BlurhashCanvas
          hash={item.blurhash}
          className={loaded ? `${styles.blur} ${styles.faded}` : styles.blur}
        />
      )}
      {src && (
        <img
          className={failed ? `${styles.img} ${styles.hidden}` : styles.img}
          src={src}
          alt={item.alt ?? ""}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={onError}
        />
      )}
    </button>
  );
}
