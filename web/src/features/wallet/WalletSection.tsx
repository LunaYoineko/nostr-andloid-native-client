import { type FormEvent, useId, useState } from "react";
import { t, useT } from "../../i18n";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import styles from "../settings/SettingsSections.module.css";
import { NwcError } from "./nwc";
import { connectNwc, disconnectNwc, useNwc } from "./nwcManager";

/** 接続失敗の文言（ネイティブは message をそのまま出すが、Web は理由ごとに言い換える） */
function connectFailureMessage(e: unknown): string {
  if (e instanceof NwcError) {
    switch (e.reason) {
      case "invalid-uri":
        return t("web_wallet_err_invalid_uri");
      case "no-info":
        return t("web_wallet_err_no_info");
      case "unsupported":
        return t("web_wallet_err_unsupported");
      case "timeout":
        return t("web_wallet_err_timeout");
      case "wallet-error":
        return t("web_wallet_err_wallet", e.message);
      case "unavailable":
        return t("web_wallet_err_unavailable");
    }
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * [#537] ウォレット接続（NWC / NIP-47、ネイティブ WalletSettings に対応）。接続文字列を登録すると
 * Zap をアプリ内で完結できる（送金は毎回確認、ZapDialog 側）。secret は鍵の保管庫（nostrism-vault）に
 * 取り出し不可の鍵で暗号化して保存し、Web は共用 PC を想定してログアウトでも消す
 * （ネイティブは「接続を解除」でだけ消す）。
 */
export function WalletSection() {
  const t = useT();
  const connection = useNwc((s) => s.connection);
  const inputId = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const canPaste = typeof navigator.clipboard?.readText === "function";

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setValue(text);
    } catch {
      // 読めなければ何もしない（権限の拒否など）
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const uri = value.trim();
    if (busy || uri === "") return;
    setBusy(true);
    setError(null);
    try {
      await connectNwc(uri);
      setValue("");
    } catch (err) {
      setError(connectFailureMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>{t("nwc_title")}</h3>
      <p className={styles.desc}>{t("web_wallet_desc")}</p>
      {connection ? (
        <>
          <div className={styles.note}>
            <p className={styles.value}>{t("nwc_connected")}</p>
            <p className={styles.mono}>{`relay: ${connection.relayUrl}`}</p>
            <p className={styles.mono}>{`wallet: ${connection.walletPubkey.slice(0, 12)}…`}</p>
            {connection.lud16 && <p className={styles.mono}>{`lud16: ${connection.lud16}`}</p>}
            {connection.methods && <p className={styles.mono}>{t("nwc_methods_fmt", connection.methods)}</p>}
          </div>
          <button
            type="button"
            className={`${styles.danger} ${styles.alignStart}`}
            onClick={() => setConfirmDisconnect(true)}
          >
            {t("nwc_disconnect")}
          </button>
        </>
      ) : (
        <form className={styles.row} onSubmit={submit}>
          <label htmlFor={inputId} className="srOnly">
            {t("web_wallet_uri_label")}
          </label>
          <input
            id={inputId}
            className={styles.input}
            type="text"
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="nostr+walletconnect://…"
            value={value}
            disabled={busy}
            aria-invalid={error !== null}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
          {canPaste && (
            <button type="button" className={styles.ghost} disabled={busy} onClick={() => void paste()}>
              {t("theme_code_paste")}
            </button>
          )}
          <button type="submit" className={styles.primary} disabled={busy || value.trim() === ""}>
            {busy ? t("connecting") : t("nwc_connect")}
          </button>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </form>
      )}
      <p className={styles.desc}>{t("web_wallet_hint")}</p>
      {confirmDisconnect && (
        <ConfirmDialog
          title={t("nwc_disconnect_confirm_title")}
          text={t("web_wallet_disconnect_text")}
          confirmLabel={t("nwc_disconnect")}
          destructive
          onConfirm={() => {
            disconnectNwc();
            setConfirmDisconnect(false);
          }}
          onDismiss={() => setConfirmDisconnect(false)}
        />
      )}
    </div>
  );
}
