import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";
import { tabScrollTarget } from "../app/deck/geometry";
import styles from "./ColumnTabs.module.css";
import { RelayIndicator } from "./RelayIndicator";
import { scrollBehavior, scrollToLeft } from "./useLayoutMode";

export type ColumnTab = { id: string; title: string };

/**
 * Compact の上部バー（ネイティブ CompactPager のタブ列）。タブ + 「＋」→ 選択カラムの ⋯ → 接続表示。
 * ⋯ はタブの中ではなくタブ列の右に置く（タブ列は横スクロールするので、中に置くとドロップダウンが切れる）。
 * 選択タブが完全に見えていれば動かさず、見えていなければ前に少し覗かせて寄せる（#324 / #334）。
 */
export function ColumnTabs({
  columns,
  activeId,
  onSelect,
  onAdd,
  menu,
}: {
  columns: ColumnTab[];
  activeId: string | null;
  onSelect(id: string): void;
  onAdd(): void;
  menu: ReactNode;
}) {
  const strip = useRef<HTMLUListElement>(null);
  const tabs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const list = strip.current;
    const tab = activeId === null ? undefined : tabs.current.get(activeId);
    if (!list || !tab) return;
    const target = tabScrollTarget(tab.offsetLeft, tab.offsetWidth, list.scrollLeft, list.clientWidth);
    if (target !== null) scrollToLeft(list, target, scrollBehavior());
  }, [activeId]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (e.key === "ArrowRight") next = index + 1;
    else if (e.key === "ArrowLeft") next = index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = columns.length - 1;
    else return;
    e.preventDefault();
    const target = columns[next];
    if (!target || next === index) return;
    onSelect(target.id);
    tabs.current.get(target.id)?.focus();
  };

  return (
    <div className={styles.bar}>
      <nav aria-label="カラム" className={styles.tabsNav}>
        <ul ref={strip} className={styles.strip}>
          {columns.map((c, i) => {
            const active = c.id === activeId;
            return (
              <li key={c.id}>
                <button
                  ref={(el) => {
                    if (!el) return;
                    tabs.current.set(c.id, el);
                    return () => {
                      tabs.current.delete(c.id);
                    };
                  }}
                  type="button"
                  className={styles.tab}
                  id={`deck-tab-${c.id}`}
                  aria-controls={`deck-col-${c.id}`}
                  aria-current={active ? "true" : undefined}
                  tabIndex={active ? 0 : -1}
                  onClick={() => onSelect(c.id)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                >
                  {c.title}
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" className={styles.add} aria-label="カラム追加" onClick={onAdd}>
              ＋
            </button>
          </li>
        </ul>
      </nav>
      {menu}
      <RelayIndicator orientation="horizontal" />
    </div>
  );
}
