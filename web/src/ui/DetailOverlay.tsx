import { type ReactNode, useEffect, useRef } from "react";
import type { OverlayKind } from "../app/navState";
import { useT } from "../i18n";
import styles from "./DetailOverlay.module.css";
import { useLayoutMode } from "./useLayoutMode";

/** Esc を入力欄に任せる要素 */
const EDITABLE = "input, textarea, select, [contenteditable]";

/**
 * 宛先の上に重ねる詳細の枠（ネイティブ AppScaffold の DetailOverlay）。内容領域だけを覆う（レール・下部ナビは見えたまま）。
 * スレッドは Expanded で中央寄せ最大 520px + スクリム（ConstrainedOverlay）、それ以外は内容領域の全面。
 * 開いたら枠にフォーカスし、閉じたら元の要素へ戻す。Esc で閉じる（ネイティブ KeyboardShortcuts の popDetail）。
 */
export function DetailOverlay({
  kind,
  onClose,
  label,
  children,
}: {
  kind: OverlayKind;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const t = useT();
  const mode = useLayoutMode();
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    section.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
      // ライトボックス等のモーダル <dialog> を開いているときは dialog 側に任せる
      if (document.querySelector("dialog[open]")) return;
      if (e.target instanceof Element && e.target.matches(EDITABLE)) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (kind === "thread" && mode === "expanded") {
    return (
      <div className={styles.centered}>
        {/* スクリムはパネルの兄弟（外側のクリックだけを拾う） */}
        <button
          type="button"
          className={styles.scrim}
          aria-label={t("common_close")}
          tabIndex={-1}
          onClick={onClose}
        />
        <section ref={section} className={styles.panel} aria-label={label} tabIndex={-1}>
          {children}
        </section>
      </div>
    );
  }
  return (
    <section ref={section} className={styles.full} aria-label={label} tabIndex={-1}>
      {children}
    </section>
  );
}
