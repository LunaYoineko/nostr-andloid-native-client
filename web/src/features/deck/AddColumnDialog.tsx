import { useState } from "react";
import { useT } from "../../i18n";
import {
  buildColumn,
  type ColumnSpec,
  type ColumnTemplate,
  TEMPLATES,
  templateHint,
  templateLabel,
} from "../../lib/columns";
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
  const t = useT();
  const [selected, setSelected] = useState<ColumnTemplate | null>(null);

  const dismiss = () => useDeck.getState().setShowAddColumn(false);

  const add = (spec: ColumnSpec) => {
    useDeck.getState().addColumn(spec);
    dismiss();
  };

  const pick = (tpl: ColumnTemplate) => {
    if (tpl.config !== "NONE") {
      setSelected(tpl);
      return;
    }
    const existing = new Set(useDeck.getState().columns.map((c) => c.id));
    const spec = buildColumn(tpl.template, {}, existing, unixNow());
    if (spec) add(spec);
  };

  return (
    <ModalSheet title={selected ? templateLabel(selected.template) : t("add_column")} onDismiss={dismiss}>
      <div className={styles.body}>
        {selected ? (
          <ColumnConfigForm
            key={selected.template}
            template={selected}
            submitLabel={t("common_add")}
            cancelLabel={t("common_back")}
            onCancel={() => setSelected(null)}
            onSubmit={add}
          />
        ) : (
          <ul className={styles.templates}>
            {TEMPLATES.map((tpl) => (
              <li key={tpl.template}>
                <button type="button" className={styles.template} onClick={() => pick(tpl)}>
                  <Icon name={columnIcon(tpl.iconKind)} size="lg" className={styles.templateIcon} />
                  <span className={styles.templateText}>
                    <span className={styles.templateLabel}>{templateLabel(tpl.template)}</span>
                    {templateHint(tpl.template) && (
                      <span className={styles.templateHint}>{templateHint(tpl.template)}</span>
                    )}
                  </span>
                  {tpl.config !== "NONE" && (
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
