import { useState } from "react";
import type { NoteMedia as Media } from "../../lib/media";
import { useEmbedPrefs } from "../linkcard/embedPrefs";
import { ImageGrid } from "./ImageGrid";
import { Lightbox } from "./Lightbox";
import styles from "./NoteMedia.module.css";
import { VideoPlayer } from "./VideoPlayer";
import { YouTubeCard } from "./YouTubeCard";

/**
 * 動画・YouTube の上限（ネイティブの Embed.kt detectEmbeds(max = 4)）。画像は別枠で上限なし。
 * ネイティブは出現順に混ぜて 4 件だが、NoteMedia に順序が無いので動画 → YouTube の順に数える。
 */
const EMBED_LIMIT = 4;

/**
 * 投稿のメディア（NoteItem からの唯一の入口）。画像（グリッド / カルーセル → ライトボックス）→ 動画 → YouTube の順。
 */
export function NoteMedia({ media }: { media: Media }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const prefs = useEmbedPrefs();
  const { images } = media;
  // 上限 4 は設定に関係なく決める（動画を OFF にしても、その分を YouTube に回さない）
  const videosDetected = media.videos.slice(0, EMBED_LIMIT);
  const youtubeDetected = media.youtube.slice(0, EMBED_LIMIT - videosDetected.length);
  const videos = prefs.video ? videosDetected : [];
  const youtube = prefs.youtube ? youtubeDetected : [];
  if (images.length + videos.length + youtube.length === 0) return null;

  return (
    <>
      <div className={styles.media}>
        {images.length > 0 && <ImageGrid images={images} onOpen={setLightbox} />}
        {videos.map((video) => (
          <VideoPlayer key={video.url} item={video} />
        ))}
        {youtube.map((video) => (
          <YouTubeCard key={video.id} id={video.id} />
        ))}
      </div>
      {lightbox !== null && <Lightbox items={images} index={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}
