import { Timeline } from "../features/timeline/Timeline";
import { useFollowingTimeline } from "../features/timeline/useFollowingTimeline";
import { shortNpub } from "../lib/npub";
import { useRelayConnections } from "../nostr/pool";
import { useSession } from "../signer/session";
import styles from "./Home.module.css";

/** ホーム（暫定）。ヘッダ（npub の短縮・ログアウト・見出し・接続数）と単一のタイムライン */
export function Home() {
  const pubkey = useSession((s) => s.pubkey);
  const logout = useSession((s) => s.logout);
  // RequireSession の内側なので pubkey は必ずある
  return pubkey ? <HomeScreen me={pubkey} onLogout={logout} /> : null;
}

function HomeScreen({ me, onLogout }: { me: string; onLogout: () => void }) {
  const { mode, loading, events } = useFollowingTimeline(me);
  const { connected, total } = useRelayConnections();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.row}>
          <span className={styles.brand}>Nostrism</span>
          <span className={styles.npub}>{shortNpub(me)}</span>
          <button type="button" className={styles.logout} onClick={onLogout}>
            ログアウト
          </button>
        </div>
        <div className={styles.row}>
          <h1 className={styles.title}>
            {mode === "following" ? "フォロー中" : "グローバル（フォローなし）"}
          </h1>
          {loading && <span className={styles.status}>読み込み中…</span>}
          <span className={styles.connections}>{`接続 ${connected}/${total}`}</span>
        </div>
      </header>
      <main className={styles.body}>
        <Timeline events={events} loading={loading} />
      </main>
    </div>
  );
}
