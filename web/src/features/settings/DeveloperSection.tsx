import { normalizeURL } from "applesauce-core/helpers/url";
import { use$ } from "applesauce-react/hooks/use-$";
import type { RelayStatus } from "applesauce-relay/types";
import { useMemo, useState } from "react";
import { displayRelayUrl } from "../../nostr/outbox";
import { pool, useRelays } from "../../nostr/pool";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { clearCacheAndReload } from "./cache";
import styles from "./SettingsSections.module.css";

/** 開発者（接続状態の一覧・キャッシュ消去） */
export function DeveloperSection() {
  return (
    <>
      <ConnectionsBlock />
      <ClearCacheBlock />
    </>
  );
}

const NO_STATUSES: Record<string, RelayStatus> = {};

type ConnectionRow = {
  url: string;
  connected: boolean;
  authenticated: boolean;
  read: boolean;
  write: boolean;
};

/**
 * 接続状態（ネイティブ ConnectionMonitorDialog のリレー一覧）。プールのリレー（リレーヒント由来も含む）と
 * read / write リレーを URL 順に並べる。
 */
function ConnectionsBlock() {
  const statuses = use$(pool.status$) ?? NO_STATUSES;
  const read = useRelays((s) => s.read);
  const write = useRelays((s) => s.write);
  const rows = useMemo(() => {
    const readSet = new Set(read.map((url) => normalizeURL(url)));
    const writeSet = new Set(write.map((url) => normalizeURL(url)));
    const urls = [...new Set([...Object.keys(statuses), ...readSet, ...writeSet])].sort();
    return urls.map(
      (url): ConnectionRow => ({
        url,
        connected: statuses[url]?.connected ?? false,
        authenticated: statuses[url]?.authenticated ?? false,
        read: readSet.has(url),
        write: writeSet.has(url),
      }),
    );
  }, [statuses, read, write]);
  const connected = rows.filter((r) => r.connected).length;

  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>接続状態</h3>
      <p className={styles.desc}>{`接続中 ${connected} / ${rows.length}`}</p>
      <ul className={styles.relays} aria-label="リレーの接続状態">
        {rows.map((r) => (
          <li key={r.url} className={styles.relay}>
            <span className={styles.dot} data-connected={r.connected} aria-hidden="true" />
            <span className={styles.relayUrl} title={r.url}>
              {displayRelayUrl(r.url)}
            </span>
            <span className={styles.relayMeta}>
              {[
                r.connected ? "接続中" : "未接続",
                r.authenticated ? "認証済み" : null,
                r.read ? "read" : null,
                r.write ? "write" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** キャッシュ消去（ネイティブ DataSettings の強制キャッシュパージ）。確認のうえ消して再読み込みする */
function ClearCacheBlock() {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>キャッシュ</h3>
      <p className={styles.desc}>
        この端末に保存しているキャッシュ（タイムラインの履歴・プロフィール・送信待ち・リンクカード）をすべて消去し、再読み込みしてリレーから取り直します。ログイン情報（鍵）とリレー・カラムの設定は消えません。
      </p>
      <button
        type="button"
        className={`${styles.danger} ${styles.alignStart}`}
        onClick={() => setConfirming(true)}
      >
        キャッシュを消去
      </button>
      {confirming && (
        <ConfirmDialog
          title="キャッシュを消去しますか？"
          text="保存済みのイベント・プロフィール・送信待ち・リンクカードをすべて削除し、再読み込みします。ログイン情報（鍵）は消えません。この操作は元に戻せません。"
          confirmLabel="消去する"
          destructive
          onConfirm={() => {
            setConfirming(false);
            void clearCacheAndReload();
          }}
          onDismiss={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
