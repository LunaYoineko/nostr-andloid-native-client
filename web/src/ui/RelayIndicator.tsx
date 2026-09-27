import { useRelayConnections } from "../nostr/pool";
import styles from "./RelayIndicator.module.css";

export type RelayAggregate = "all" | "some" | "none";

/** 接続の集計（全接続 / 一部 / 無し） */
export function relayAggregate(connected: number, total: number): RelayAggregate {
  if (total > 0 && connected === total) return "all";
  return connected > 0 ? "some" : "none";
}

/**
 * リレーの接続表示（ネイティブ RelayRailIndicator）。点 + 接続数/総数。表示だけで操作はしない。
 * horizontal = Compact のタブ列の右端、vertical = レールの下。
 */
export function RelayIndicator({ orientation }: { orientation: "horizontal" | "vertical" }) {
  const { connected, total } = useRelayConnections();
  const label = `リレー接続 ${connected}/${total}`;
  return (
    <span
      className={styles.indicator}
      data-orientation={orientation}
      role="img"
      aria-label={label}
      title={label}
    >
      <span className={styles.dot} data-state={relayAggregate(connected, total)} aria-hidden="true" />
      <span aria-hidden="true">{`${connected}/${total}`}</span>
    </span>
  );
}
