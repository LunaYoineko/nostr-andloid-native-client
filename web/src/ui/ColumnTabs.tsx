import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";
import { tabScrollTarget } from "../app/deck/geometry";
import { useT } from "../i18n";
import { columnDisplayTitle } from "../i18n/columnTitles";
import styles from "./ColumnTabs.module.css";
import { RelayIndicator } from "./RelayIndicator";
import { scrollBehavior, scrollToLeft } from "./useLayoutMode";

export type ColumnTab = { id: string; title: string };

/**
 * Compact の上部バー（ネイティブ CompactPager のタブ列）。タブ + 「＋」→ 選択カラムの ⋯ → 接続表示。
 * ⋯ はタブの中ではなくタブ列の右に置く（タブ列は横スクロールするので、中に置くとドロップダウンが切れる）。
 * 選択タブが完全に見えていれば動かさず、見えていなければ前に少し覗かせて寄せる（#324 / #334）。
 * [#597][#661] 左レール表示時（rail・expanded）はレール側に同じ接続表示が出るので、showRelay=false で二重表示を避ける。
 */
export function ColumnTabs({
  columns,
  activeId,
  onSelect,
  onAdd,
  menu,
  showRelay,
}: {
  columns: ColumnTab[];
  activeId: string | null;
  onSelect(id: string): void;
  onAdd(): void;
  menu: ReactNode;
  showRelay: boolean;
}) {
  const t = useT();
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
      <nav aria-label={t("web_columns_nav")} className={styles.tabsNav}>
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
                  {columnDisplayTitle(c.title)}
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" className={styles.add} aria-label={t("nav_add_column")} onClick={onAdd}>
              ＋
            </button>
          </li>
        </ul>
      </nav>
      {menu}
      {showRelay && <RelayIndicator orientation="horizontal" />}
    </div>
  );
}
