import type { ReactNode } from "react";
import styles from "./ComingSoon.module.css";

/** 準備中の画面の本文（中央寄せの案内文） */
export function ComingSoon({ children }: { children: ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}
