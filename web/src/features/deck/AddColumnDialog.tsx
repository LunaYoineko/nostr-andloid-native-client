import { useEffect, useId, useRef, useState } from "react";
import { buildColumn, type ColumnSpec, type ColumnTemplate, TEMPLATES } from "../../lib/columns";
import { unixNow } from "../../lib/time";
import { useDeck } from "../../store/deck";
import { columnIcon, Icon } from "../../ui/icons";
import { ColumnConfigForm } from "./ColumnConfigForm";
import styles from "./ColumnDialog.module.css";

/**
 * カラム追加（ネイティブの AddColumnSheet）。白紙のフィルタ組みではなくテンプレから選ぶ。
 * 設定が要るテンプレは選ぶと入力欄を出す。閉じたら（close イベント）store の showAddColumn を戻す。
 */
export function AddColumnDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<ColumnTemplate | null>(null);
  const titleId = useId();

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const add = (spec: ColumnSpec) => {
    useDeck.getState().addColumn(spec);
    dialog.current?.close();
  };

  const pick = (t: ColumnTemplate) => {
    if (t.config !== "NONE") {
      setSelected(t);
      return;
    }
    const existing = new Set(useDeck.getState().columns.map((c) => c.id));
    const spec = buildColumn(t.template, {}, existing, unixNow());
    if (spec) add(spec);
  };

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={() => useDeck.getState().setShowAddColumn(false)}
    >
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          {selected?.label ?? "カラムを追加"}
        </h2>
        <button
          type="button"
          className={styles.close}
          aria-label="閉じる"
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" size="lg" />
        </button>
      </div>
      {selected ? (
        <ColumnConfigForm
          key={selected.template}
          template={selected}
          submitLabel="追加"
          cancelLabel="戻る"
          onCancel={() => setSelected(null)}
          onSubmit={add}
        />
      ) : (
        <ul className={styles.templates}>
          {TEMPLATES.map((t) => (
            <li key={t.template}>
              <button type="button" className={styles.template} onClick={() => pick(t)}>
                <Icon name={columnIcon(t.iconKind)} size="lg" className={styles.templateIcon} />
                <span className={styles.templateText}>
                  <span className={styles.templateLabel}>{t.label}</span>
                  {t.hint && <span className={styles.templateHint}>{t.hint}</span>}
                </span>
                {t.config !== "NONE" && (
                  <span className={styles.more} aria-hidden="true">
                    ›
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </dialog>
  );
}
