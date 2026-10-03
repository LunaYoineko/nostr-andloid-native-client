import { useState } from "react";
import { useT } from "../../i18n";
import { useYouTubeInfo } from "../linkcard/youtubeInfo";
import styles from "./YouTubeCard.module.css";

/**
 * YouTube のその場再生（ネイティブの LinkEmbeds.kt YouTubeEmbed）。押すまで iframe は出さない
 * （常にサムネ + タイトル帯 → 押して youtube-nocookie の iframe に差し替える）。
 * タイムラインに複数並んだときに iframe ごと読み込んで重くなるのと、スクロールしただけで
 * Google に接続が発生する（プライバシー）のを避けるため、データセーバーに関係なく常にこの経路を使う。
 * 仮想リストで行が画面外に出て作り直されれば、サムネに戻る（React の state は行ごとに新規になる）。
 */
export function YouTubeCard({ id }: { id: string }) {
  const [active, setActive] = useState(false);
  if (active) return <ActiveYouTube id={id} />;
  return <YouTubeThumb id={id} onPlay={() => setActive(true)} />;
}

/**
 * iframe 本体（押した後だけ）。autoplay=1 で再生を始める。ページの Referrer-Policy は no-referrer だが、
 * それだと YouTube 側が埋め込みでの再生を拒むことがあるため strict-origin-when-cross-origin を明示する。
 * CSP の frame-src は許可済み（static/_headers）。
 */
function ActiveYouTube({ id }: { id: string }) {
  return (
    <iframe
      className={styles.frame}
      src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
      title="YouTube"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="autoplay; encrypted-media; picture-in-picture; web-share"
      allowFullScreen
    />
  );
}

/**
 * サムネカード（押すまでの既定表示）。サムネは img.youtube.com から直接読む（プロキシは通さない。
 * 読めなければ黒地のまま）。上端にタイトル帯（/api/oembed のタイトル + チャンネル名。取れたときだけ）。
 * 押すと iframe（自動再生）に差し替える。
 */
function YouTubeThumb({ id, onPlay }: { id: string; onPlay: () => void }) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const info = useYouTubeInfo(id);
  return (
    <button type="button" className={styles.card} onClick={onPlay} aria-label={t("web_youtube_play")}>
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
