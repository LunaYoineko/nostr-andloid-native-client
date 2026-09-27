import type { ReactNode } from "react";
import styles from "./SingleColumnPane.module.css";
import { useLayoutMode } from "./useLayoutMode";

/** 1 カラムの画面（検索・通知・設定など）。Expanded では中央寄せで最大 520px（ネイティブ SingleColumnPane） */
export function SingleColumnPane({ children }: { children: ReactNode }) {
  const mode = useLayoutMode();
  return (
    <div className={styles.pane} data-layout={mode}>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
