import { useState } from "react";
import { isDataSaver } from "../../lib/imageProxy";
import { useYouTubeInfo } from "../linkcard/youtubeInfo";
import styles from "./YouTubeCard.module.css";

/**
 * YouTube のその場再生（ネイティブの LinkEmbeds.kt YouTubeEmbed）。
 * 通常は youtube-nocookie の iframe（16:9）をそのまま置く。データセーバー中（imageProxy の isDataSaver）は
 * サムネ + タイトル帯だけを出し、押して初めて iframe（自動再生）に差し替える（従量回線での無駄な読み込みを避ける）。
 */
export function YouTubeCard({ id }: { id: string }) {
  const [active, setActive] = useState(() => !isDataSaver());
  if (active) return <ActiveYouTube id={id} autoplay={isDataSaver()} />;
  return <YouTubeThumb id={id} onPlay={() => setActive(true)} />;
}

/**
 * iframe 本体。ページの Referrer-Policy は no-referrer だが、それだと YouTube 側が埋め込みでの再生を
 * 拒むことがあるため strict-origin-when-cross-origin を明示する。CSP の frame-src は許可済み（static/_headers）。
 */
function ActiveYouTube({ id, autoplay }: { id: string; autoplay: boolean }) {
  const src = `https://www.youtube-nocookie.com/embed/${id}${autoplay ? "?autoplay=1" : ""}`;
  return (
    <iframe
      className={styles.frame}
      src={src}
      title="YouTube"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="autoplay; encrypted-media; picture-in-picture; web-share"
      allowFullScreen
    />
  );
}

/**
 * サムネカード（データセーバー中のみ）。サムネは img.youtube.com から直接読む（プロキシは通さない。
 * 読めなければ黒地のまま）。上端にタイトル帯（/api/oembed のタイトル + チャンネル名。取れたときだけ）。
 * 押すと iframe（自動再生）に差し替える。
 */
function YouTubeThumb({ id, onPlay }: { id: string; onPlay: () => void }) {
  const [failed, setFailed] = useState(false);
  const info = useYouTubeInfo(id);
  return (
    <button type="button" className={styles.card} onClick={onPlay} aria-label="YouTube を再生">
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
    </button>
  );
}
