import { RELAY_STATE_LABEL, readRelayStates, usePolled } from "../nostr/connStats";
import { displayRelayUrl } from "../nostr/outbox";
import { InfoDialog } from "./InfoDialog";
import styles from "./RelayStatusDialog.module.css";

/**
 * リレー状態の一覧（ネイティブ RelayStatusDialog）。接続表示（RelayIndicator）を押すと開く。
 * 接続表示と同じ read リレーを、点・URL・状態（接続 / 接続中 / 切断）で並べる。1 秒ごとに読み直す。
 */
export function RelayStatusDialog({ onDismiss }: { onDismiss(): void }) {
  const rows = usePolled(readRelayStates);
  return (
    <InfoDialog title="リレー状態" onDismiss={onDismiss}>
      {rows.length === 0 ? (
        <p className={styles.empty}>接続中のリレーはありません</p>
      ) : (
        <ul className={styles.list} aria-label="リレー状態">
          {rows.map((r) => (
            <li key={r.url} className={styles.row}>
              <span className={styles.dot} data-state={r.state} aria-hidden="true" />
              <span className={styles.url} title={r.url}>
                {displayRelayUrl(r.url)}
              </span>
              <span className={styles.state} data-state={r.state}>
                {RELAY_STATE_LABEL[r.state]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </InfoDialog>
  );
}
