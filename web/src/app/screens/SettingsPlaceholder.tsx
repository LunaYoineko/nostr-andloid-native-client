import { shortNpub } from "../../lib/npub";
import { displayName, useProfile } from "../../nostr/loaders";
import { useSession } from "../../signer/session";
import { AccountAvatar } from "../../ui/AccountAvatar";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { SingleColumnPane } from "../../ui/SingleColumnPane";
import { LogoutButton } from "../LogoutButton";
import { ComingSoon } from "./ComingSoon";
import styles from "./SettingsPlaceholder.module.css";

/**
 * 設定（#463 が置き換える）。M0 のヘッダにあったアカウント（npub）とログアウトをここに置く。
 * 置き換えるときもログアウトの導線は残すこと。
 */
export function SettingsPlaceholder() {
  const me = useSession((s) => s.pubkey);
  return (
    <SingleColumnPane>
      <ScreenHeader title="設定" />
      {/* RequireSession の内側なので pubkey は必ずある */}
      {me && <Account me={me} />}
      <ComingSoon>その他の設定は準備中です</ComingSoon>
    </SingleColumnPane>
  );
}

function Account({ me }: { me: string }) {
  const profile = useProfile(me);
  return (
    <section className={styles.account} aria-label="アカウント">
      <AccountAvatar size={40} />
      <div className={styles.names}>
        <p className={styles.name}>{displayName(profile, me)}</p>
        <p className={styles.npub}>{shortNpub(me)}</p>
      </div>
      <LogoutButton className={styles.logout} />
    </section>
  );
}
