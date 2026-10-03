import { useState } from "react";
import { useT } from "../i18n";
import { useRelayConnections } from "../nostr/pool";
import styles from "./RelayIndicator.module.css";
import { RelayStatusDialog } from "./RelayStatusDialog";

export type RelayAggregate = "all" | "some" | "none";

/** 接続の集計（全接続 / 一部 / 無し） */
export function relayAggregate(connected: number, total: number): RelayAggregate {
  if (total > 0 && connected === total) return "all";
  return connected > 0 ? "some" : "none";
}

/**
 * リレーの接続表示（ネイティブ RelayRailIndicator）。点 + 接続数/総数。押すとリレー状態の一覧（RelayStatusDialog）。
 * horizontal = Compact のタブ列の右端、vertical = レールの下。
 */
export function RelayIndicator({ orientation }: { orientation: "horizontal" | "vertical" }) {
  const t = useT();
  const { connected, total } = useRelayConnections();
  const [open, setOpen] = useState(false);
  const label = t("web_relay_connection_label", connected, total);
  return (
    <>
      <button
        type="button"
        className={styles.indicator}
        data-orientation={orientation}
        aria-label={label}
        aria-haspopup="dialog"
        title={label}
        onClick={() => setOpen(true)}
      >
        <span className={styles.dot} data-state={relayAggregate(connected, total)} aria-hidden="true" />
        <span aria-hidden="true">{`${connected}/${total}`}</span>
      </button>
      {open && <RelayStatusDialog onDismiss={() => setOpen(false)} />}
    </>
  );
}
