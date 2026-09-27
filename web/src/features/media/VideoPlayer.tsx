import { useEffect, useRef, useState } from "react";
import { proxied } from "../../lib/imageProxy";
import type { MediaItem } from "../../lib/media";
import { PlayArrowIcon } from "../../ui/icons";
import { BlurhashCanvas } from "./BlurhashCanvas";
import { claimPlayback, releasePlayback } from "./playback";
import { retrySource } from "./Thumb";
import styles from "./VideoPlayer.module.css";

const HTTPS = /^https:\/\//i;

/**
 * 本文の動画（ネイティブの VideoPlayer.android.kt）。最初はポスター + ▶ だけで、押して初めて <video> を作り
 * 無音で自動再生する（音量・全画面はブラウザ標準の controls）。同時に再生するのは 1 本だけ。
 * ポスターは imeta の thumb（https のみ）、無ければ blurhash、どちらも無ければ黒地。
 * CSP の media-src が https: のみなので、https でない動画は再生しない。
 */
export function VideoPlayer({ item }: { item: MediaItem }) {
  const [active, setActive] = useState(false);
  const playable = HTTPS.test(item.url);
  const thumb = item.thumb && HTTPS.test(item.thumb) ? item.thumb : null;

  if (active && playable) {
    return <ActiveVideo url={item.url} poster={thumb ? proxied(thumb, 800) : undefined} />;
  }
  return (
    <button
      type="button"
      className={styles.poster}
      aria-label="動画を再生"
      onClick={() => {
        if (playable) setActive(true);
      }}
    >
      {item.blurhash && <BlurhashCanvas hash={item.blurhash} className={styles.blur} />}
      {thumb && <PosterImage thumb={thumb} />}
      <span className={styles.play}>
        <PlayArrowIcon className={styles.playIcon} />
      </span>
      <span className={styles.badge}>動画</span>
    </button>
  );
}

/** ポスター画像。プロキシが読めなければ元 URL で 1 度だけ取り直し（Thumb と同じ）、それも駄目なら消す */
function PosterImage({ thumb }: { thumb: string }) {
  const [src, setSrc] = useState<string | null>(() => proxied(thumb, 800));
  if (!src) return null;
  return (
    <img
      className={styles.thumb}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setSrc(retrySource(src))}
    />
  );
}

function ActiveVideo({ url, poster }: { url: string; poster: string | undefined }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // React は muted をプロパティにしか反映しない。既定ミュートを属性（defaultMuted）にも出しておく
    video.defaultMuted = true;
    return () => releasePlayback(video);
  }, []);

  return (
    <video
      ref={ref}
      className={styles.video}
      src={url}
      poster={poster}
      controls
      autoPlay
      muted
      playsInline
      preload="metadata"
      onPlay={(event) => claimPlayback(event.currentTarget)}
    />
  );
}
