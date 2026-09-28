import { use$ } from "applesauce-react/hooks/use-$";
import { useState } from "react";
import { useNavigate } from "react-router";
import { map } from "rxjs";
import { displayRelayUrl, relayPrefsFromEvent } from "../../nostr/outbox";
import { eventStore } from "../../nostr/store";
import { ADD_RELAY_STATE, useOwnRelayPrefs } from "../settings/RelaySection";
import styles from "./ProfileRelays.module.css";

/**
 * 使用リレー（ネイティブ ProfileRelaysSection）。kind:10002 が無ければ何も出さない。
 * 見出しで開閉し、行は URL と read / write。自分の一覧に無いリレーは「追加」でリレー設定を開き、
 * そのリレーを read + write で下書きに足す（発行はリレー設定の「保存」で）。あれば「追加済み」。
 */
export function ProfileRelays({ pubkey }: { pubkey: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const mine = new Set(useOwnRelayPrefs().current.map((p) => p.url));
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
              <span className={styles.names}>
                <span className={styles.url}>{displayRelayUrl(p.url)}</span>
                <span className={styles.marker}>
                  {[p.read ? "read" : null, p.write ? "write" : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              {mine.has(p.url) ? (
                <span className={styles.added}>追加済み</span>
              ) : (
                <button
                  type="button"
                  className={styles.add}
                  aria-label={`${displayRelayUrl(p.url)} を自分のリレーに追加`}
                  // プロフィールの「編集」と同じく、リレー設定へ置き換えて開く
                  onClick={() =>
                    void navigate("/settings/relays", { replace: true, state: { [ADD_RELAY_STATE]: p.url } })
                  }
                >
                  追加
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
