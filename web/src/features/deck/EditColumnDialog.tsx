import { useEffect, useId, useRef } from "react";
import { useT } from "../../i18n";
import {
  type ColumnSpec,
  type ColumnTemplate,
  editRelays,
  editTemplate,
  editText,
  TEMPLATES,
  templateLabel,
} from "../../lib/columns";
import { useDeck } from "../../store/deck";
import { ColumnConfigForm } from "./ColumnConfigForm";
import styles from "./ColumnDialog.module.css";

/**
 * フィルターの再設定（⋯ →「フィルターを編集」。ネイティブの EditColumnDialog）。
 * 追加と同じ入力を今の値でプリフィルし、保存で updateColumn（id / pinned / order は store 側で維持）。
 */
export function EditColumnDialog() {
  const id = useDeck((s) => s.editingColumnId);
  const spec = useDeck((s) => s.columns.find((c) => c.id === id));
  const templateId = spec ? editTemplate(spec) : null;
  const template = TEMPLATES.find((tpl) => tpl.template === templateId);

  // 対象が消えた・設定を持たないカラムなら閉じる
  useEffect(() => {
    if (id !== null && (!spec || !template)) useDeck.getState().setEditing(null);
  }, [id, spec, template]);

  if (!spec || !template) return null;
  return <EditDialog key={spec.id} spec={spec} template={template} />;
}

function EditDialog({ spec, template }: { spec: ColumnSpec; template: ColumnTemplate }) {
  const t = useT();
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
      onClose={() => useDeck.getState().setEditing(null)}
    >
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          {t("web_deck_edit_filter_title", templateLabel(template.template))}
        </h2>
      </div>
      <ColumnConfigForm
        template={template}
        initialText={editText(spec)}
        initialRelays={editRelays(spec)}
        initialKinds={spec.filter.kinds}
        submitLabel={t("common_save")}
        cancelLabel={t("common_cancel")}
        onCancel={() => dialog.current?.close()}
        onSubmit={(newSpec) => {
          useDeck.getState().updateColumn(spec.id, newSpec);
          dialog.current?.close();
        }}
      />
    </dialog>
  );
}
