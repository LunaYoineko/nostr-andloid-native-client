import { useT } from "../../i18n";
import { SendIcon } from "../../ui/icons";
import styles from "./ReplyBox.module.css";

/**
 * スレッド下端の「返信を書く…」（ネイティブの ThreadColumn.kt ReplyBox）。押すと返信コンポーザを開く。
 * onClick が無ければ返信先が無い状態（T3）。ネイティブと同じく見た目は変えず無効化するだけ。
 */
export function ReplyBox({ onClick }: { onClick?: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      className={styles.box}
      aria-label={t("web_thread_reply_label")}
      disabled={!onClick}
      onClick={onClick}
    >
      <span className={styles.pill}>{t("thread_write_reply")}</span>
      <SendIcon className={styles.send} />
    </button>
  );
}
