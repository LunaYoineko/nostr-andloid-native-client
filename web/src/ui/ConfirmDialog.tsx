import { useEffect, useId, useRef } from "react";
import { useT } from "../i18n";
import styles from "./ConfirmDialog.module.css";

/**
 * 確認ダイアログ（ネイティブの DeckConfirmDialog）。見出し → 本文 → 右寄せの「キャンセル」「確認」。
 * マウントしたらモーダルで開く。Esc / Android の戻る（cancel）はキャンセルと同じ。
 */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  destructive = false,
  dismissLabel,
  onConfirm,
  onDismiss,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  destructive?: boolean;
  dismissLabel?: string;
  onConfirm(): void;
  onDismiss(): void;
}) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const textId = useId();

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={textId}
      onCancel={(e) => {
        e.preventDefault();
        onDismiss();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <p id={textId} className={styles.text}>
        {text}
      </p>
      <div className={styles.buttons}>
        <button type="button" className={`${styles.button} ${styles.dismiss}`} onClick={onDismiss}>
          {dismissLabel ?? t("common_cancel")}
        </button>
        <button
          type="button"
          className={`${styles.button} ${destructive ? styles.destructive : styles.confirm}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
