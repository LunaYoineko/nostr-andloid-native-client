import { decode } from "nostr-tools/nip19";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import styles from "./NewConversationDialog.module.css";

const HEX64 = /^[0-9a-f]{64}$/i;

/** 新しい会話の相手の入力（npub か 64 桁の hex）→ pubkey（hex）。読めなければ null */
export function parsePeerInput(input: string): string | null {
  const value = input.trim();
  if (HEX64.test(value)) return value.toLowerCase();
  if (!value.startsWith("npub1")) return null;
  try {
    const decoded = decode(value);
    return decoded.type === "npub" ? decoded.data : null;
  } catch {
    return null;
  }
}

/**
 * 新しいメッセージの相手を入れるダイアログ（ネイティブ DmScreen の新規 DM）。枠は ConfirmDialog と同じ。
 * npub / hex が読めたときだけ「開く」を押せる。マウントしたらモーダルで開く。Esc / 戻る（cancel）は「キャンセル」と同じ
 */
export function NewConversationDialog({
  onOpen,
  onDismiss,
}: {
  onOpen(pubkey: string): void;
  onDismiss(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const inputId = useId();
  const [value, setValue] = useState("");
  const pubkey = parsePeerInput(value);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pubkey !== null) onOpen(pubkey);
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onDismiss();
      }}
    >
      <form onSubmit={submit}>
        <h2 id={titleId} className={styles.title}>
          新しいメッセージ
        </h2>
        <label htmlFor={inputId} className="srOnly">
          相手の npub または hex
        </label>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="npub または hex"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className={styles.buttons}>
          <button type="button" className={`${styles.button} ${styles.dismiss}`} onClick={onDismiss}>
            キャンセル
          </button>
          <button type="submit" className={`${styles.button} ${styles.confirm}`} disabled={pubkey === null}>
            開く
          </button>
        </div>
      </form>
    </dialog>
  );
}
