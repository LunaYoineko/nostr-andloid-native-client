import { npubEncode } from "nostr-tools/nip19";
import { useSession } from "../signer/session";
import styles from "./Home.module.css";

/** ホーム（暫定）。ヘッダに npub の短縮表示とログアウトだけを置く */
export function Home() {
  const pubkey = useSession((s) => s.pubkey);
  const logout = useSession((s) => s.logout);
  return (
    <div>
      <header className={styles.header}>
        <span className={styles.brand}>Nostrism</span>
        {pubkey && <span className={styles.npub}>{`${npubEncode(pubkey).slice(0, 12)}…`}</span>}
        <button type="button" className={styles.logout} onClick={logout}>
          ログアウト
        </button>
      </header>
      <main className={styles.body}>
        <p>タイムラインは #442 で実装します。</p>
      </main>
    </div>
  );
}
