import { useEffect, useId, useRef } from "react";
import styles from "./ShortcutsHelp.module.css";

/**
 * 一覧の行（ネイティブ KeyboardShortcuts.kt の SHORTCUTS。文言はそのまま）。
 * b（ブックマーク）は #531 でキーと一緒に足す。⌘/Ctrl + R はブラウザの再読み込みに任せる（同じ効果）。
 */
export const SHORTCUTS: readonly (readonly [keys: string, description: string])[] = [
  ["j / ↓", "次の投稿"],
  ["k / ↑", "前の投稿"],
  ["l / →", "右のカラム"],
  ["h / ←", "左のカラム"],
  ["g / G", "先頭 / 末尾"],
  ["Enter / o", "スレッドを開く"],
  ["r", "返信"],
  ["t", "リポスト"],
  ["f", "いいね / リアクション"],
  ["n", "新規投稿"],
  ["⌘/Ctrl + Enter", "投稿する（作成中）"],
  ["/", "検索"],
  [".", "先頭へ（新着）"],
  ["⌘/Ctrl + R", "再接続（タイムライン再構築）"],
  ["?", "このヘルプ"],
  ["Esc", "戻る / 閉じる"],
];

/** 一覧の <dialog>（KeyboardShortcuts が「ほかのダイアログが開いている」から除く） */
export const HELP_SELECTOR = "[data-shortcuts-help]";

/**
 * ショートカット一覧（? で開く。ネイティブ ShortcutsHelpOverlay）。全面のスクリム + 中央のカード。
 * マウントしたらモーダルで開く。スクリムを押すか Esc で閉じる。
 */
export function ShortcutsHelp({ onClose }: { onClose(): void }) {
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
      <button type="button" className={styles.scrim} aria-label="閉じる" tabIndex={-1} onClick={onClose} />
      <div className={styles.card}>
        <h2 id={titleId} className={styles.title}>
          キーボードショートカット
        </h2>
        <dl className={styles.list}>
          {SHORTCUTS.map(([keys, description]) => (
            <div key={keys} className={styles.row}>
              <dt>
                <kbd className={styles.keys}>{keys}</kbd>
              </dt>
              <dd className={styles.description}>{description}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.hint}>Esc または画面タップで閉じる</p>
      </div>
    </dialog>
  );
}
