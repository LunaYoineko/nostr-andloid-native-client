import { useState } from "react";
import { buildColumn, type ColumnSpec, type ColumnTemplate, TEMPLATES } from "../../lib/columns";
import { unixNow } from "../../lib/time";
import { useDeck } from "../../store/deck";
import { columnIcon, Icon } from "../../ui/icons";
import { ModalSheet } from "../../ui/ModalSheet";
import { ColumnConfigForm } from "./ColumnConfigForm";
import styles from "./ColumnDialog.module.css";

/**
 * カラム追加（ネイティブの AddColumnSheet）。白紙のフィルタ組みではなくテンプレから選ぶ。
 * 設定が要るテンプレは選ぶと入力欄を出す。[#593] 器は上寄せの共通モーダル（ModalSheet）に統一。
 * フィルター編集（EditColumnDialog）は今まで通り中央ダイアログのまま。
 */
export function AddColumnDialog() {
  const [selected, setSelected] = useState<ColumnTemplate | null>(null);

  const dismiss = () => useDeck.getState().setShowAddColumn(false);

  const add = (spec: ColumnSpec) => {
    useDeck.getState().addColumn(spec);
    dismiss();
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
    <ModalSheet title={selected?.label ?? "カラムを追加"} onDismiss={dismiss}>
      <div className={styles.body}>
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
      </div>
    </ModalSheet>
  );
}
