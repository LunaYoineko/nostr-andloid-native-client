import styles from "./PullToRefreshIndicator.module.css";

/**
 * usePullToRefresh の状態を描く円形インジケータ（#601）。引いている間は progress（0〜1）に応じて
 * 回転・不透明度が増え、離してしきい値を超えていれば refreshing の間スピナーとして回り続ける。
 * 見た目だけの部品（aria-hidden）。置き先には position: relative が要る。
 */
export function PullToRefreshIndicator({ progress, refreshing }: { progress: number; refreshing: boolean }) {
  if (progress <= 0 && !refreshing) return null;
  return (
    <div className={styles.indicator} aria-hidden="true">
      <span
        className={styles.ring}
        data-spinning={refreshing}
        style={refreshing ? undefined : { opacity: progress, transform: `rotate(${progress * 360}deg)` }}
      />
    </div>
  );
}
