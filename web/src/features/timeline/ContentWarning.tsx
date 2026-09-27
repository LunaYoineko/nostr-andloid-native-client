import { VisibilityOffIcon } from "../../ui/icons";
import styles from "./ContentWarning.module.css";

/**
 * NIP-36 のコンテンツ警告（ネイティブの NoteItem.kt ContentWarningFold）。押すと本文を出す。
 * reason が "" なら理由の行は出さない。
 */
export function ContentWarning({ reason, onReveal }: { reason: string; onReveal: () => void }) {
  return (
    <button type="button" className={styles.fold} aria-expanded={false} onClick={onReveal}>
      <VisibilityOffIcon className={styles.icon} />
      <span className={styles.texts}>
        <span className={styles.title}>センシティブな内容</span>
        {reason !== "" && <span className={styles.reason}>{reason}</span>}
      </span>
      <span className={styles.reveal}>表示</span>
    </button>
  );
}
