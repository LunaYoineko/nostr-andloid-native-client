import { use$ } from "applesauce-react/hooks/use-$";
import { useState } from "react";
import { map } from "rxjs";
import { displayRelayUrl, relayPrefsFromEvent } from "../../nostr/outbox";
import { eventStore } from "../../nostr/store";
import styles from "./ProfileRelays.module.css";

/**
 * 使用リレー（ネイティブ ProfileRelaysSection）。kind:10002 が無ければ何も出さない。
 * 見出しで開閉し、行は URL と read / write。「追加」は #463。
 */
export function ProfileRelays({ pubkey }: { pubkey: string }) {
  const [open, setOpen] = useState(false);
  const prefs =
    use$(
      () => eventStore.replaceable(10002, pubkey).pipe(map((e) => (e ? relayPrefsFromEvent(e) : []))),
      [pubkey],
    ) ?? [];
  if (prefs.length === 0) return null;
  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        使用リレー ({prefs.length}) <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ul className={styles.list}>
          {prefs.map((p) => (
            <li key={p.url} className={styles.item}>
              <span className={styles.url}>{displayRelayUrl(p.url)}</span>
              <span className={styles.marker}>
                {[p.read ? "read" : null, p.write ? "write" : null].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
