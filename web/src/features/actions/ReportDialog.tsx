import { useEffect, useId, useRef } from "react";
import styles from "./ReportDialog.module.css";

/** NIP-56 の理由（ネイティブ ReportDialog と同じ並び・文言） */
const REASONS: readonly { type: string; label: string }[] = [
  { type: "illegal", label: "違法・児童の安全に関わる" },
  { type: "nudity", label: "性的・ヌード" },
  { type: "spam", label: "スパム" },
  { type: "impersonation", label: "なりすまし" },
  { type: "profanity", label: "不適切な表現" },
  { type: "other", label: "その他" },
];

/**
 * 通報の理由を選ぶダイアログ（ネイティブ NoteItem.kt の ReportDialog）。枠は #458 の ConfirmDialog と同じ。
 * マウントしたらモーダルで開く。Esc / Android の戻る（cancel）は「キャンセル」と同じ。
 */
export function ReportDialog({ onPick, onDismiss }: { onPick(type: string): void; onDismiss(): void }) {
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
        この投稿を通報
      </h2>
      <p id={textId} className={styles.text}>
        理由を選んでください（NIP-56 で報告します）
      </p>
      <div className={styles.reasons}>
        {REASONS.map((r) => (
          <button key={r.type} type="button" className={styles.reason} onClick={() => onPick(r.type)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className={styles.buttons}>
        <button type="button" className={styles.dismiss} onClick={onDismiss}>
          キャンセル
        </button>
      </div>
    </dialog>
  );
}
