import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { proxied } from "../../lib/imageProxy";
import type { MediaItem } from "../../lib/media";
import { PlayArrowIcon } from "../../ui/icons";
import { BlurhashCanvas } from "./BlurhashCanvas";
import { claimPlayback, releasePlayback, savedPositionOf, savePosition, wasActivated } from "./playback";
import { retrySource } from "./Thumb";
import styles from "./VideoPlayer.module.css";

const HTTPS = /^https:\/\//i;

/**
 * 本文の動画（ネイティブの VideoPlayer.android.kt）。最初はポスター + ▶ だけで、押して初めて <video> を作り
 * 無音で自動再生する（音量・全画面はブラウザ標準の controls）。同時に再生するのは 1 本だけ。
 * ポスターは imeta の thumb（https のみ）、無ければ blurhash、どちらも無ければ黒地。
 * CSP の media-src が https: のみなので、https でない動画は再生しない。
 *
 * [#141][#540] 一度再生した動画は、仮想リストから外れて戻ってきてもポスターに戻さず、
 * 同じ位置の一時停止状態から見せる（自動では再生しない。playback.ts の URL → 位置のメモリ）。
 */
export function VideoPlayer({ item }: { item: MediaItem }) {
  const t = useT();
  const [active, setActive] = useState(() => wasActivated(item.url));
  // 初回の活性化（＝ポスターを押した）だけ自動再生する。復帰時は最初の描画で決まる
  const [autoPlay] = useState(() => !wasActivated(item.url));
  const playable = HTTPS.test(item.url);
  const thumb = item.thumb && HTTPS.test(item.thumb) ? item.thumb : null;

  if (active && playable) {
    return (
      <ActiveVideo
        url={item.url}
        poster={thumb ? proxied(thumb, 800) : undefined}
        resumeAt={savedPositionOf(item.url)}
        autoPlay={autoPlay}
      />
    );
  }
  return (
    <button
      type="button"
      className={styles.poster}
      aria-label={t("web_video_play")}
      onClick={() => {
        if (!playable) return;
        savePosition(item.url, savedPositionOf(item.url)); // 「一度でも再生した」を記録する
        setActive(true);
      }}
    >
      {item.blurhash && <BlurhashCanvas hash={item.blurhash} className={styles.blur} />}
      {thumb && <PosterImage thumb={thumb} />}
      <span className={styles.play}>
        <PlayArrowIcon className={styles.playIcon} />
      </span>
      <span className={styles.badge}>{t("media_video_badge")}</span>
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

function ActiveVideo({
  url,
  poster,
  resumeAt,
  autoPlay,
}: {
  url: string;
  poster: string | undefined;
  /** [#141] 前回の再生位置（秒）。0 なら最初から */
  resumeAt: number;
  autoPlay: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // React は muted をプロパティにしか反映しない。既定ミュートを属性（defaultMuted）にも出しておく
    video.defaultMuted = true;
    // [#141] 復帰時は続きの位置へ（読み込み前でもブラウザが位置を覚えて反映する）
    if (resumeAt > 0) video.currentTime = resumeAt;
    const onTimeUpdate = () => savePosition(url, video.currentTime);
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      savePosition(url, video.currentTime);
      releasePlayback(video);
    };
  }, [url, resumeAt]);

  return (
    <video
      ref={ref}
      className={styles.video}
      src={url}
      poster={poster}
      controls
      autoPlay={autoPlay}
      muted
      playsInline
      preload="metadata"
      onPlay={(event) => claimPlayback(event.currentTarget)}
    />
  );
}
