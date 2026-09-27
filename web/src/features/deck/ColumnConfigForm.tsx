import { type FormEvent, useId, useState } from "react";
import { buildColumn, type ColumnSpec, type ColumnTemplate, NOTIF_KINDS } from "../../lib/columns";
import { unixNow } from "../../lib/time";
import { useDeck } from "../../store/deck";
import styles from "./ColumnDialog.module.css";

/** textarea の 1 行 1 リレー。wss:// で始まらない行は無視する */
function parseRelays(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("wss://"));
}

/**
 * テンプレの設定入力（カラム追加・フィルター編集で共通。ネイティブの ConfigPane / EditColumnDialog の中身）。
 * TEXT = 1 行入力、NOTIF_FILTER = 種別のチェック、RELAY_SET = リレー URL を 1 行 1 つ。
 */
export function ColumnConfigForm({
  template,
  initialText = "",
  initialRelays = [],
  initialKinds,
  submitLabel,
  cancelLabel,
  onCancel,
  onSubmit,
}: {
  template: ColumnTemplate;
  initialText?: string;
  initialRelays?: readonly string[];
  /** 通知種別の初期値（無ければすべて on） */
  initialKinds?: readonly number[];
  submitLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onSubmit: (spec: ColumnSpec) => void;
}) {
  const [text, setText] = useState(initialText);
  const [relays, setRelays] = useState(initialRelays.join("\n"));
  const [kinds, setKinds] = useState<ReadonlySet<number>>(
    () => new Set(initialKinds ?? NOTIF_KINDS.map((k) => k.kind)),
  );
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  const canSubmit = template.config !== "TEXT" || text.trim() !== "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const existing = new Set(useDeck.getState().columns.map((c) => c.id));
    const spec = buildColumn(
      template.template,
      {
        text,
        notifKinds: NOTIF_KINDS.filter((k) => kinds.has(k.kind)).map((k) => k.kind),
        relays: parseRelays(relays),
      },
      existing,
      unixNow(),
    );
    if (spec === null) {
      setInvalid(true);
      return;
    }
    onSubmit(spec);
  };

  const toggleKind = (kind: number, checked: boolean) => {
    setKinds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(kind);
      else next.delete(kind);
      return next;
    });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      {template.config === "TEXT" && (
        <div className={styles.field}>
          <input
            type="text"
            className={styles.input}
            value={text}
            placeholder={template.hint}
            aria-label={template.label}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            autoComplete="off"
            onChange={(e) => {
              setText(e.target.value);
              setInvalid(false);
            }}
          />
          {invalid && (
            <p id={errorId} className={styles.error}>
              npub または hex を入力
            </p>
          )}
        </div>
      )}
      {template.config === "NOTIF_FILTER" && (
        <fieldset className={styles.kinds}>
          <legend className={styles.caption}>表示する種別</legend>
          {NOTIF_KINDS.map((k) => (
            <label key={k.kind} className={styles.check}>
              <input
                type="checkbox"
                checked={kinds.has(k.kind)}
                onChange={(e) => toggleKind(k.kind, e.target.checked)}
              />
              {k.label}
            </label>
          ))}
        </fieldset>
      )}
      {template.config === "RELAY_SET" && (
        <label className={styles.field}>
          <span className={styles.caption}>{template.hint}</span>
          <textarea
            className={styles.textarea}
            value={relays}
            rows={4}
            placeholder="wss://"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setRelays(e.target.value)}
          />
        </label>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="submit" className={styles.primary} disabled={!canSubmit}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
