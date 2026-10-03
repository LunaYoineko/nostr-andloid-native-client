import { decode } from "nostr-tools/nip19";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useT } from "../../i18n";
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
  const t = useT();
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
          {t("dm_new_title")}
        </h2>
        <label htmlFor={inputId} className="srOnly">
          {t("web_dm_new_peer_label")}
        </label>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t("tpl_profile_hint")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className={styles.buttons}>
          <button type="button" className={`${styles.button} ${styles.dismiss}`} onClick={onDismiss}>
            {t("common_cancel")}
          </button>
          <button type="submit" className={`${styles.button} ${styles.confirm}`} disabled={pubkey === null}>
            {t("dm_open")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
