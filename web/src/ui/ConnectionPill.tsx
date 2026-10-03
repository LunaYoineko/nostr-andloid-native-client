import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { useRelayConnections } from "../nostr/pool";
import styles from "./ConnectionPill.module.css";

const ROTATE_MS = 2000;
/** 接続待ちの文言の数（ネイティブ ja リソース connecting_1..6） */
const CONNECTING_COUNT = 6;

/** 接続済みのリレーが 0 の間だけ、内容領域の上端中央に出すピル（ネイティブ ConnectionIndicator） */
export function ConnectionPill() {
  const t = useT();
  const { connected, total } = useRelayConnections();
  const visible = connected === 0 && total > 0;
  const [index, setIndex] = useState(0);
  // 非表示になったら先頭の文言に戻す（次に出るときは 1 つ目から）
  if (!visible && index !== 0) setIndex(0);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % CONNECTING_COUNT), ROTATE_MS);
    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) return null;
  // 接続待ちの文言。2 秒ごとに回す
  const messages = [
    t("connecting_1"),
    t("connecting_2"),
    t("connecting_3"),
    t("connecting_4"),
    t("connecting_5"),
    t("connecting_6"),
  ];
  return (
    <div role="status" aria-label={t("web_connection_pill_label")} className={styles.pill}>
      <span className={styles.spinner} aria-hidden="true" />
      {/* 2 秒ごとに読み上げが鳴らないよう、回る文言は隠す */}
      <span aria-hidden="true">{messages[index]}</span>
    </div>
  );
}
