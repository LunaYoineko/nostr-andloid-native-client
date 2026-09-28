import { type CSSProperties, type ReactNode, useEffect, useId, useRef } from "react";
import styles from "./InfoDialog.module.css";

/**
 * 見るだけのダイアログ（ネイティブの AlertDialog + 「閉じる」）。見出し → スクロールする本文 → 右寄せのボタン。
 * マウントしたらモーダルで開く。Esc / Android の戻る（cancel）は「閉じる」と同じ。
 * onBack があれば見出しの前に「←」（参照先へ潜ったのを 1 段戻す）、action があれば「閉じる」の左に出す。
 */
export function InfoDialog({
  title,
  subtitle,
  onBack,
  action,
  onDismiss,
  children,
  maxWidth = 560,
}: {
  title: string;
  /** 見出しの横の補足（kind:1 など） */
  subtitle?: string;
  onBack?: () => void;
  action?: { label: string; onClick(): void; disabled?: boolean };
  onDismiss(): void;
  children: ReactNode;
  /** 最大幅 px（既定 560。リレー状態はネイティブと同じ 340。レスポンシブ L3） */
  maxWidth?: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      style={{ "--dialog-max-w": `${maxWidth}px` } as CSSProperties}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onDismiss();
      }}
    >
      <div className={styles.head}>
        {onBack && (
          <button type="button" className={styles.back} aria-label="戻る" onClick={onBack}>
            ←
          </button>
        )}
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>
      <div className={styles.body}>{children}</div>
      <div className={styles.buttons}>
        {action && (
          <button
            type="button"
            className={`${styles.button} ${styles.action}`}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
        <button type="button" className={`${styles.button} ${styles.dismiss}`} onClick={onDismiss}>
          閉じる
        </button>
      </div>
    </dialog>
  );
}
