import { useEffect, useRef } from "react";
import styles from "./Toaster.module.css";
import { TOAST_MS, useToast } from "./toast";

/** 内容領域の下寄りに 1 件ずつ出すトースト（ネイティブの Toast）。出してから TOAST_MS で次へ進む */
export function Toaster() {
  const queue = useToast((s) => s.queue);
  // 先頭を出し始めた時刻。後ろに積まれても先頭の残り時間は延ばさない
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (queue.length === 0) {
      shownAt.current = null;
      return;
    }
    if (shownAt.current === null) shownAt.current = Date.now();
    const timer = setTimeout(
      () => {
        shownAt.current = null;
        useToast.setState((s) => ({ queue: s.queue.slice(1) }));
      },
      Math.max(0, shownAt.current + TOAST_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [queue]);

  const message = queue[0];
  if (message === undefined) return null;
  return (
    <div role="status" aria-live="polite" className={styles.toast}>
      {message}
    </div>
  );
}
