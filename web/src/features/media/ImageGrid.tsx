import type { MediaItem } from "../../lib/media";
import styles from "./ImageGrid.module.css";
import { Thumb } from "./Thumb";

/** 1 枚表示のアスペクト比の範囲（極端な縦長 / 横長でタイムラインを占有しない） */
const MIN_RATIO = 0.75;
const MAX_RATIO = 2;

/**
 * 投稿画像の並べ方（ネイティブの NoteImages.kt）。どれも読み込み前に高さが決まる（タイムラインがずれない）。
 *  - 1 枚: 全幅。imeta の dim があればその比（0.75〜2）、無ければ高さ 200px で切り抜き
 *  - 2〜9 枚: 正方形のグリッド（2 / 4 枚は 2 列、それ以外は 3 列）
 *  - 10 枚以上: 140px 角の横スクロール
 */
export function ImageGrid({ images, onOpen }: { images: MediaItem[]; onOpen: (index: number) => void }) {
  const total = images.length;
  if (total === 0) return null;

  if (total === 1) {
    const [image] = images;
    const dim = image.dim;
    return (
      <div
        className={dim ? styles.one : `${styles.one} ${styles.single}`}
        style={dim ? { aspectRatio: Math.min(Math.max(dim.w / dim.h, MIN_RATIO), MAX_RATIO) } : undefined}
      >
        <Thumb item={image} proxyWidth={800} index={0} total={1} onOpen={onOpen} className={styles.fill} />
      </div>
    );
  }

  if (total >= 10) {
    return (
      <div className={styles.carousel}>
        {images.map((image, index) => (
          <Thumb
            key={image.url}
            item={image}
            proxyWidth={280}
            index={index}
            total={total}
            onOpen={onOpen}
            className={styles.slide}
          />
        ))}
      </div>
    );
  }

  const columns = total === 2 || total === 4 ? styles.cols2 : styles.cols3;
  return (
    <div className={`${styles.grid} ${columns}`}>
      {images.map((image, index) => (
        <Thumb
          key={image.url}
          item={image}
          proxyWidth={400}
          index={index}
          total={total}
          onOpen={onOpen}
          className={styles.cell}
        />
      ))}
    </div>
  );
}
