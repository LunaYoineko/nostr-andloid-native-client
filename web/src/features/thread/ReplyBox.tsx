import { SendIcon } from "../../ui/icons";
import styles from "./ReplyBox.module.css";

/** スレッド下端の「返信を書く…」（ネイティブの ThreadColumn.kt ReplyBox）。押すと返信コンポーザを開く */
export function ReplyBox({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.box} aria-label="返信を書く" onClick={onClick}>
      <span className={styles.pill}>返信を書く…</span>
      <SendIcon className={styles.send} />
    </button>
  );
}
