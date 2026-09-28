import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCloseMenuOnBack } from "../app/history";
import styles from "./MenuButton.module.css";

export type MenuEntry =
  | { type: "item"; label: string; onSelect(): void; tone?: "danger" }
  | { type: "separator" }
  | { type: "header"; label: string };

/** 画面端からの最小の余白（--sp-2） */
const EDGE = 8;
/** トリガとメニューの間（--sp-1） */
const GAP = 4;

/**
 * Popover API があるか。無い環境（古いブラウザ・jsdom）では popover 属性を付けず、固定配置の要素として出す
 * （jsdom は [popover] を開けないまま display: none にする）。
 */
const POPOVER_SUPPORTED = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

/** 描画用の key。開いている間は並びが変わらないので種類 + 位置でよい */
function keyed(entries: MenuEntry[]): { key: string; entry: MenuEntry }[] {
  let n = 0;
  return entries.map((entry) => ({ key: `${entry.type}-${n++}`, entry }));
}

/**
 * ボタン + ドロップダウンメニュー（ネイティブの DeckDropdownMenu）。メニューは popover="auto" で最前面に出し、
 * トリガの右端に揃えて下に置く（下に入らなければ上）。項目・外側の押下・Escape・戻る・スクロール・リサイズで閉じる。
 */
export function MenuButton({
  label,
  triggerClassName,
  children,
  entries,
}: {
  label: string;
  triggerClassName: string;
  children: ReactNode;
  entries: MenuEntry[];
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // 開いている間にトリガを押すと、先にブラウザの light dismiss で閉じる。その押下で開き直さないよう覚えておく
  const openAtPointerDown = useRef(false);

  // [#540] 開いている間の「戻る」はメニューを閉じるだけにする
  useCloseMenuOnBack(open, () => setOpen(false));

  useLayoutEffect(() => {
    const el = menu.current;
    const button = trigger.current;
    if (!open || !el || !button) return;
    if (POPOVER_SUPPORTED) el.showPopover();
    const rect = button.getBoundingClientRect();
    const left = Math.min(
      Math.max(rect.right - el.offsetWidth, EDGE),
      window.innerWidth - el.offsetWidth - EDGE,
    );
    let top = rect.bottom + GAP;
    if (top + el.offsetHeight > window.innerHeight - EDGE && rect.top - GAP - el.offsetHeight >= EDGE) {
      top = rect.top - GAP - el.offsetHeight;
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menu.current?.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 詳細オーバーレイ等の Escape で一緒に閉じないようにする
      e.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  /** ↑ ↓ で項目間を移る（端では止まる） */
  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? Math.min(index + 1, items.length - 1) : Math.max(index - 1, 0);
    items[next]?.focus();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={triggerClassName}
        onPointerDown={() => {
          openAtPointerDown.current = open;
        }}
        onClick={() => {
          const wasOpen = open || openAtPointerDown.current;
          openAtPointerDown.current = false;
          setOpen(!wasOpen);
        }}
      >
        {children}
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          popover={POPOVER_SUPPORTED ? "auto" : undefined}
          className={styles.menu}
          onKeyDown={onMenuKeyDown}
          onToggle={(e) => {
            if (e.newState === "closed") setOpen(false);
          }}
        >
          {keyed(entries).map(({ key, entry }) => {
            if (entry.type === "header") {
              return (
                <p key={key} className={styles.header}>
                  {entry.label}
                </p>
              );
            }
            if (entry.type === "separator") return <hr key={key} className={styles.separator} />;
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                className={entry.tone === "danger" ? `${styles.item} ${styles.danger}` : styles.item}
                onClick={() => {
                  setOpen(false);
                  entry.onSelect();
                }}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
