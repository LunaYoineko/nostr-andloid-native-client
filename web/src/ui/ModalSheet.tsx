import { type ReactNode, useEffect, useId, useLayoutEffect, useRef } from "react";
import { useT } from "../i18n";
import { CloseIcon } from "./icons";
import styles from "./ModalSheet.module.css";

/**
 * [#587] 上寄せの全画面モーダル（ネイティブ AppModalSheet）の共通の器。
 * 見出し + ✕ の固定ヘッダーの下に children をそのまま積む（スクロールさせたい部分は
 * 呼び出し側で flex: 1; min-height: 0; overflow-y: auto を持つ要素にする。ReactionPickerDialog の
 * .scroll と同じ作法）。テーマ編集・テーマストア・ハッシュタグ整理がこれに載る。
 */
export function ModalSheet({
  title,
  onDismiss,
  children,
}: {
  title: string;
  onDismiss(): void;
  children: ReactNode;
}) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const latestOnDismiss = useRef(onDismiss);
  useLayoutEffect(() => {
    latestOnDismiss.current = onDismiss;
  });

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  // カードの外（dialog 自身 = 背景）の押下で閉じる
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === d) latestOnDismiss.current();
    };
    d.addEventListener("click", onClick);
    return () => d.removeEventListener("click", onClick);
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      // React は cancel / close を親へ伝えるので、外側の dialog（投稿シート等）を一緒に
      // 閉じないよう止める（ReactionPickerDialog と同じ作法）
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }}
      onClose={(e) => {
        e.stopPropagation();
        onDismiss();
      }}
    >
      <div className={styles.card}>
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label={t("common_close")} onClick={onDismiss}>
            <CloseIcon className={styles.closeIcon} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
