import { npubEncode } from "nostr-tools/nip19";
import { useMemo } from "react";
import { LogoutButton } from "../../app/LogoutButton";
import { shortNpub } from "../../lib/npub";
import { displayName, useProfile } from "../../nostr/loaders";
import { type SessionMethod, useSession } from "../../signer/session";
import { AccountAvatar } from "../../ui/AccountAvatar";
import { showToast } from "../../ui/toast";
import styles from "./SettingsSections.module.css";

const METHOD_LABEL: Record<SessionMethod, string> = {
  nip07: "拡張機能（NIP-07）",
  local: "このブラウザに保管した秘密鍵（nsec）",
};

/** アカウント（npub のコピー・ログイン方式・ログアウト） */
export function AccountSection() {
  const me = useSession((s) => s.pubkey);
  const method = useSession((s) => s.method);
  // RequireSession の内側なので pubkey は必ずある
  if (!me) return null;
  return (
    <>
      <div className={styles.block}>
        <h3 className={styles.caption}>公開鍵（npub）</h3>
        <NpubField me={me} />
      </div>
      <div className={styles.block}>
        <h3 className={styles.caption}>ログイン方式</h3>
        <p className={styles.value}>{method ? METHOD_LABEL[method] : "未ログイン"}</p>
      </div>
      <div className={styles.block}>
        <LogoutButton className={`${styles.ghost} ${styles.alignStart}`} />
      </div>
    </>
  );
}

/** 一覧の先頭のアカウント行（M0 の設定にあったもの。押すとアカウントを開く） */
export function AccountSummary({ onOpen }: { onOpen(): void }) {
  const me = useSession((s) => s.pubkey);
  const profile = useProfile(me ?? undefined);
  if (!me) return null;
  return (
    <button type="button" className={`${styles.account} ${styles.accountButton}`} onClick={onOpen}>
      <AccountAvatar size={40} />
      <span className={styles.names}>
        <span className={styles.name}>{displayName(profile, me)}</span>
        <span className={styles.shortNpub}>{shortNpub(me)}</span>
      </span>
    </button>
  );
}

function NpubField({ me }: { me: string }) {
  const npub = useMemo(() => npubEncode(me), [me]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(npub);
    } catch {
      showToast("コピーできませんでした");
      return;
    }
    showToast("npub をコピーしました");
  }
  return (
    <>
      <p className={styles.mono}>{npub}</p>
      <button type="button" className={`${styles.ghost} ${styles.alignStart}`} onClick={() => void copy()}>
        npub をコピー
      </button>
    </>
  );
}
