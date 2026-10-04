import { use$ } from "applesauce-react/hooks/use-$";
import { useState } from "react";
import { map } from "rxjs";
import { useT } from "../../i18n";
import { displayRelayUrl, relayPrefsFromEvent } from "../../nostr/outbox";
import { addRelay, useRelayRows } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { showToast } from "../../ui/toast";
import styles from "./ProfileRelays.module.css";

/**
 * 使用リレー（ネイティブ ProfileRelaysSection）。kind:10002 が無ければ何も出さない。
 * 見出しで開閉し、行は URL と read / write。自分の一覧に無いリレーは「追加」で即座に手動リレーとして足し
 * （read/write = true）、トーストを出す（遷移しない。#585）。既にあれば「追加済み」。
 */
export function ProfileRelays({ pubkey }: { pubkey: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const mine = new Set(useRelayRows().map((r) => r.url));
  const prefs =
    use$(
      () => eventStore.replaceable(10002, pubkey).pipe(map((e) => (e ? relayPrefsFromEvent(e) : []))),
      [pubkey],
    ) ?? [];
  if (prefs.length === 0) return null;
  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t("profile_relays_fmt", prefs.length)} <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ul className={styles.list}>
          {prefs.map((p) => (
            <li key={p.url} className={styles.item}>
              <span className={styles.names}>
                <span className={styles.url}>{displayRelayUrl(p.url)}</span>
                <span className={styles.marker}>
                  {[p.read ? "read" : null, p.write ? "write" : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              {mine.has(p.url) ? (
                <span className={styles.added}>{t("relay_already_added")}</span>
              ) : (
                <button
                  type="button"
                  className={styles.add}
                  aria-label={t("web_profile_relay_add_label", displayRelayUrl(p.url))}
                  onClick={() => {
                    addRelay(p.url);
                    showToast(t("relay_added"));
                  }}
                >
                  {t("relay_add_to_mine")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
