import { useEffect, useId, useRef } from "react";
import { useT } from "../../i18n";
import styles from "./ReportDialog.module.css";

/**
 * 通報の理由を選ぶダイアログ（ネイティブ NoteItem.kt / ProfileScreen.kt の ReportDialog）。
 * 枠は #458 の ConfirmDialog と同じ。マウントしたらモーダルで開く。Esc / Android の戻る（cancel）は「キャンセル」と同じ。
 * title は投稿の通報（既定）とユーザーの通報（プロフィールの ⋯）で出し分ける。
 */
export function ReportDialog({
  title,
  onPick,
  onDismiss,
}: {
  title?: string;
  onPick(type: string): void;
  onDismiss(): void;
}) {
  const t = useT();
  /** NIP-56 の理由（ネイティブ ReportDialog と同じ並び・文言） */
  const reasons: readonly { type: string; label: string }[] = [
    { type: "illegal", label: t("report_illegal") },
    { type: "nudity", label: t("report_nudity") },
    { type: "spam", label: t("report_spam") },
    { type: "impersonation", label: t("report_impersonation") },
    { type: "profanity", label: t("report_profanity") },
    { type: "other", label: t("report_other") },
  ];
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
        {title ?? t("report_title")}
      </h2>
      <p id={textId} className={styles.text}>
        {t("report_pick_reason")}
      </p>
      <div className={styles.reasons}>
        {reasons.map((r) => (
          <button key={r.type} type="button" className={styles.reason} onClick={() => onPick(r.type)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className={styles.buttons}>
        <button type="button" className={styles.dismiss} onClick={onDismiss}>
          {t("common_cancel")}
        </button>
      </div>
    </dialog>
  );
}
