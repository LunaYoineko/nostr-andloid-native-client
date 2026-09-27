import { nprofileEncode } from "nostr-tools/nip19";
import { useEffect, useRef, useState } from "react";
import { relayHintsOf } from "../../nostr/outbox";
import { Icon } from "../../ui/icons";
import styles from "./ProfileHeaderCard.module.css";

/**
 * プロフィールの ⋯ メニュー。nprofile（相手の kind:10002 の先頭 3 件をリレーヒントに）と njump のリンクをコピーする。
 * 開閉は ColumnMenu と同じ（外側のクリックと Escape で閉じる）。ミュート / 通報は #465 / M2。
 */
export function ProfileMenu({ pubkey, onCopied }: { pubkey: string; onCopied: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const nprofile = () => nprofileEncode({ pubkey, relays: relayHintsOf(pubkey) });

  async function copy(text: string, message: string) {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      onCopied("コピーできませんでした");
      return;
    }
    onCopied(message);
  }

  return (
    <div ref={root} className={styles.menuRoot}>
      <button
        ref={button}
        type="button"
        className={styles.circle}
        aria-label="メニュー"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="moreHoriz" size="md" />
      </button>
      {open && (
        <div role="menu" aria-label="メニュー" className={styles.menu}>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => copy(nprofile(), "nprofile をコピーしました")}
          >
            nprofile をコピー
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => copy(`https://njump.me/${nprofile()}`, "リンクをコピーしました")}
          >
            リンクをコピー（njump）
          </button>
        </div>
      )}
    </div>
  );
}
