import { Deck } from "../features/deck/Deck";
import { shortNpub } from "../lib/npub";
import { useRelayConnections } from "../nostr/pool";
import { useSession } from "../signer/session";
import { useDeck } from "../store/deck";
import { Icon } from "../ui/icons";
import styles from "./Home.module.css";

/** ホーム（暫定）。ヘッダ（npub の短縮・接続数・カラム追加・ログアウト）とデッキ */
export function Home() {
  const pubkey = useSession((s) => s.pubkey);
  const logout = useSession((s) => s.logout);
  // RequireSession の内側なので pubkey は必ずある
  return pubkey ? <HomeScreen me={pubkey} onLogout={logout} /> : null;
}

function HomeScreen({ me, onLogout }: { me: string; onLogout: () => void }) {
  const { connected, total } = useRelayConnections();
  const setShowAddColumn = useDeck((s) => s.setShowAddColumn);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.row}>
          <span className={styles.brand}>Nostrism</span>
          <span className={styles.connections}>{`接続 ${connected}/${total}`}</span>
          <span className={styles.npub}>{shortNpub(me)}</span>
          <button
            type="button"
            className={styles.add}
            aria-label="カラム追加"
            onClick={() => setShowAddColumn(true)}
          >
            <Icon name="add" size="lg" />
          </button>
          <button type="button" className={styles.logout} onClick={onLogout}>
            ログアウト
          </button>
        </div>
      </header>
      <main className={styles.body}>
        <Deck />
      </main>
    </div>
  );
}
