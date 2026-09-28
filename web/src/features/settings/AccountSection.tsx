import { npubEncode } from "nostr-tools/nip19";
import { useEffect, useMemo, useState } from "react";
import { LogoutButton } from "../../app/LogoutButton";
import { shortNpub } from "../../lib/npub";
import { displayName, useProfile } from "../../nostr/loaders";
import { getPasskeyVault, isPasskeySupported } from "../../signer/passkeyVault";
import { type SessionMethod, useSession } from "../../signer/session";
import { AccountAvatar } from "../../ui/AccountAvatar";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { showToast } from "../../ui/toast";
import styles from "./SettingsSections.module.css";

// [#543] composeApp/src/commonMain/composeResources/values-ja/strings.xml の nosskey_* と同じ文言
const NOSSKEY_TITLE = "パスキーで保護（Nosskey）";
const NOSSKEY_DESC = "秘密鍵をパスキー(生体認証)の PRF で暗号化して保護します（WebAuthn PRF）。";
const NOSSKEY_PROTECTED_UNLOCKED = "● パスキーで保護中（解錠済み）";
const NOSSKEY_UNPROTECT_LOCAL = "保護を解除（ローカル鍵に戻す）";
const NOSSKEY_PROTECTED_LOCKED = "● パスキーで保護中（未解錠）";
const NOSSKEY_UNLOCKING = "解錠中…";
const NOSSKEY_UNLOCK = "パスキーで解錠";
const NOSSKEY_UNLOCK_FAILED = "解錠に失敗しました";
const NOSSKEY_UNPROTECT = "保護を解除";
const NOSSKEY_ENROLLING = "登録中…";
const NOSSKEY_ENROLL = "パスキーで保護する";
const NOSSKEY_ENROLL_FAILED = "登録に失敗しました（PRF 非対応/キャンセル/ドメイン未関連付け）";
const NOSSKEY_LOCAL_ONLY = "ローカル鍵のときにパスキー保護を設定できます。";

const METHOD_LABEL: Record<SessionMethod, string> = {
  nip07: "拡張機能（NIP-07）",
  local: "このブラウザに保管した秘密鍵（nsec）",
  nip46: "リモート署名（NIP-46）",
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
      <NosskeyBlock />
      <div className={styles.block}>
        <LogoutButton className={`${styles.ghost} ${styles.alignStart}`} />
      </div>
    </>
  );
}

/**
 * [#543] パスキー(WebAuthn PRF)で nsec を保護する（ネイティブ SettingsScreen.kt の NosskeyLogin）。
 *  - ローカル鍵のとき「パスキーで保護する」で登録（確認ダイアログを経由）。
 *  - 登録済み未解錠のとき「パスキーで解錠」。解錠済みは保護解除のみ。
 * PRF に対応していない・判定できない環境では項目自体を出さない。
 */
function NosskeyBlock() {
  const method = useSession((s) => s.method);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    void isPasskeySupported().then((ok) => {
      if (alive) setSupported(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const vault = getPasskeyVault();
  // 開いた時点の保護状態を読み直す（restore() が済んでいれば結果は変わらないが、念のため）
  useEffect(() => {
    let alive = true;
    void vault.storedPubkey().then(() => {
      if (alive) setTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, [vault]);

  // tick を読むことで enroll/unlock/unprotect の後に再評価する（isProtected/isUnlocked は毎回読み直す）
  void tick;
  const isProtected = vault.isProtected();
  const unlocked = isProtected && vault.isUnlocked();

  // 保護中でなく、対応の判定がまだ・非対応なら項目を出さない
  if (!isProtected && supported !== true) return null;

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      const pubkey = await vault.enroll();
      if (pubkey) setTick((t) => t + 1);
      else setError(NOSSKEY_ENROLL_FAILED);
    } catch {
      setError(NOSSKEY_ENROLL_FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      const pubkey = await vault.unlock();
      if (pubkey) setTick((t) => t + 1);
      else setError(NOSSKEY_UNLOCK_FAILED);
    } catch {
      setError(NOSSKEY_UNLOCK_FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function unprotect() {
    setBusy(true);
    setError(null);
    try {
      const ok = await vault.unprotect();
      if (ok) setTick((t) => t + 1);
      else setError(NOSSKEY_UNLOCK_FAILED);
    } catch {
      setError(NOSSKEY_UNLOCK_FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>{NOSSKEY_TITLE}</h3>
      <p className={styles.desc}>{NOSSKEY_DESC}</p>
      {unlocked ? (
        <>
          <p className={styles.value}>{NOSSKEY_PROTECTED_UNLOCKED}</p>
          <button
            type="button"
            className={`${styles.ghost} ${styles.alignStart}`}
            disabled={busy}
            onClick={() => void unprotect()}
          >
            {NOSSKEY_UNPROTECT_LOCAL}
          </button>
        </>
      ) : isProtected ? (
        <>
          <p className={styles.value}>{NOSSKEY_PROTECTED_LOCKED}</p>
          <button
            type="button"
            className={`${styles.primary} ${styles.alignStart}`}
            disabled={busy}
            onClick={() => void unlock()}
          >
            {busy ? NOSSKEY_UNLOCKING : NOSSKEY_UNLOCK}
          </button>
          <button
            type="button"
            className={`${styles.ghost} ${styles.alignStart}`}
            disabled={busy}
            onClick={() => void unprotect()}
          >
            {NOSSKEY_UNPROTECT}
          </button>
        </>
      ) : method === "local" ? (
        <>
          <button
            type="button"
            className={`${styles.primary} ${styles.alignStart}`}
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            {busy ? NOSSKEY_ENROLLING : NOSSKEY_ENROLL}
          </button>
          {confirming && (
            <ConfirmDialog
              title={NOSSKEY_TITLE}
              text={`${NOSSKEY_DESC} nsec を控えてから保護してください。`}
              confirmLabel={NOSSKEY_ENROLL}
              onConfirm={() => {
                setConfirming(false);
                void enroll();
              }}
              onDismiss={() => setConfirming(false)}
            />
          )}
        </>
      ) : (
        <p className={styles.desc}>{NOSSKEY_LOCAL_ONLY}</p>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
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
