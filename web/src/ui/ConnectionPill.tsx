import { useEffect, useState } from "react";
import { useRelayConnections } from "../nostr/pool";
import styles from "./ConnectionPill.module.css";

/** 接続待ちの文言（ネイティブ ja リソース connecting_1..6）。2 秒ごとに回す */
export const CONNECTING_MESSAGES = [
  "リレーに接続中…",
  "ダチョウを追いかけています…",
  "分散の海を泳いでいます…",
  "野生のノートを探しています…",
  "リレーと握手しています…",
  "波長を合わせています…",
] as const;

const ROTATE_MS = 2000;

/** 接続済みのリレーが 0 の間だけ、内容領域の上端中央に出すピル（ネイティブ ConnectionIndicator） */
export function ConnectionPill() {
  const { connected, total } = useRelayConnections();
  const visible = connected === 0 && total > 0;
  const [index, setIndex] = useState(0);
  // 非表示になったら先頭の文言に戻す（次に出るときは 1 つ目から）
  if (!visible && index !== 0) setIndex(0);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % CONNECTING_MESSAGES.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) return null;
  return (
    <div role="status" aria-label="リレーに接続中" className={styles.pill}>
      <span className={styles.spinner} aria-hidden="true" />
      {/* 2 秒ごとに読み上げが鳴らないよう、回る文言は隠す */}
      <span aria-hidden="true">{CONNECTING_MESSAGES[index]}</span>
    </div>
  );
}
