import { useT } from "../../i18n";
import {
  connMonitorSnapshot,
  formatChars,
  NETWORK_TIER_LABEL,
  networkTier,
  RELAY_STATE_LABEL,
  usePolled,
} from "../../nostr/connStats";
import { displayRelayUrl } from "../../nostr/outbox";
import { InfoDialog } from "../../ui/InfoDialog";
import styles from "./ConnectionMonitorDialog.module.css";

/**
 * 接続と通信量（ネイティブ ConnectionMonitorDialog）。1 秒ごとに読み直す。
 * 回線（分からなければ行を出さない）・購読中の REQ 数と、リレーごとの状態・受信イベント数・受信量（概算）。
 * リレーはプールのもの（リレーヒント由来も含む）と read / write リレーを受信量の多い順に並べる。
 */
export function ConnectionMonitorDialog({ onDismiss }: { onDismiss(): void }) {
  const t = useT();
  const snapshot = usePolled(connMonitorSnapshot);
  const tier = usePolled(networkTier);
  const connected = snapshot.relays.filter((r) => r.state === "connected").length;
  return (
    <InfoDialog title={t("conn_monitor_title")} onDismiss={onDismiss}>
      <dl className={styles.summary}>
        {tier && (
          <div className={styles.kv}>
            <dt>{t("conn_monitor_network")}</dt>
            <dd>{NETWORK_TIER_LABEL[tier]}</dd>
          </div>
        )}
        <div className={styles.kv}>
          <dt>{t("conn_monitor_reqs")}</dt>
          <dd>{snapshot.reqs}</dd>
        </div>
      </dl>
      <h3 className={styles.header}>
        {t("web_settings_connmon_relays_header", connected, snapshot.relays.length)}
      </h3>
      <ul className={styles.relays} aria-label={t("web_settings_connmon_relays_label")}>
        {snapshot.relays.map((r) => (
          <li key={r.url} className={styles.relay}>
            <span className={styles.line}>
              <span className={styles.dot} data-state={r.state} aria-hidden="true" />
              <span className={styles.url} title={r.url}>
                {displayRelayUrl(r.url)}
              </span>
              <span className={styles.state}>{RELAY_STATE_LABEL[r.state]}</span>
            </span>
            <span className={styles.meta}>
              {[
                `⬇ ${formatChars(r.chars)}`,
                `${r.events}ev`,
                `REQ ${r.reqs}`,
                r.authenticated ? t("web_settings_connmon_authenticated") : null,
                r.read ? "read" : null,
                r.write ? "write" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </InfoDialog>
  );
}
