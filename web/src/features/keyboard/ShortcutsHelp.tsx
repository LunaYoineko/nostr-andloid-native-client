import { useEffect, useId, useRef } from "react";
import { useT } from "../../i18n";
import styles from "./ShortcutsHelp.module.css";

/** 一覧の <dialog>（KeyboardShortcuts が「ほかのダイアログが開いている」から除く） */
export const HELP_SELECTOR = "[data-shortcuts-help]";

/**
 * ショートカット一覧（? で開く。ネイティブ ShortcutsHelpOverlay）。全面のスクリム + 中央のカード。
 * マウントしたらモーダルで開く。スクリムを押すか Esc で閉じる。
 */
export function ShortcutsHelp({ onClose }: { onClose(): void }) {
  const t = useT();
  /**
   * 一覧の行（ネイティブ KeyboardShortcuts.kt の SHORTCUTS。文言はそのまま）。
   * ⌘/Ctrl + R はブラウザの再読み込みに任せる（同じ効果）。
   */
  const shortcuts: readonly (readonly [keys: string, description: string])[] = [
    ["j / ↓", t("web_shortcut_next_note")],
    ["k / ↑", t("web_shortcut_prev_note")],
    ["l / →", t("web_shortcut_right_column")],
    ["h / ←", t("web_shortcut_left_column")],
    ["g / G", t("web_shortcut_top_bottom")],
    ["Enter / o", t("web_shortcut_open_thread")],
    ["r", t("compose_reply")],
    ["t", t("note_repost")],
    ["f", t("web_shortcut_react")],
    ["b", t("web_shortcut_bookmark")],
    ["n", t("web_shortcut_new_post")],
    ["⌘/Ctrl + Enter", t("web_shortcut_send")],
    ["/", t("nav_search")],
    [".", t("web_shortcut_to_latest")],
    ["⌘/Ctrl + R", t("web_shortcut_reconnect")],
    ["?", t("web_shortcut_this_help")],
    ["Esc", t("web_shortcut_back_close")],
  ];
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
      aria-labelledby={titleId}
      data-shortcuts-help=""
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {/* スクリムはカードの兄弟（外側のクリックだけを拾う） */}
      <button
        type="button"
        className={styles.scrim}
        aria-label={t("common_close")}
        tabIndex={-1}
        onClick={onClose}
      />
      <div className={styles.card}>
        <h2 id={titleId} className={styles.title}>
          {t("web_shortcuts_title")}
        </h2>
        <dl className={styles.list}>
          {shortcuts.map(([keys, description]) => (
            <div key={keys} className={styles.row}>
              <dt>
                <kbd className={styles.keys}>{keys}</kbd>
              </dt>
              <dd className={styles.description}>{description}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.hint}>{t("web_shortcuts_hint")}</p>
      </div>
    </dialog>
  );
}
