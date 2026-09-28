import { type FormEvent, useId, useState } from "react";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import styles from "../settings/SettingsSections.module.css";
import { NwcError } from "./nwc";
import { connectNwc, disconnectNwc, useNwc } from "./nwcManager";

/** 接続失敗の文言（ネイティブは message をそのまま出すが、Web は理由ごとに言い換える） */
function connectFailureMessage(e: unknown): string {
  if (e instanceof NwcError) {
    switch (e.reason) {
      case "invalid-uri":
        return "接続文字列を読み取れませんでした。nostr+walletconnect:// で始まる文字列を確認してください。";
      case "no-info":
        return "ウォレットから応答がありませんでした。リレー・接続文字列を確認してください。";
      case "unsupported":
        return "このウォレットは pay_invoice（送金）に対応していません。";
      case "timeout":
        return "ウォレットの応答がタイムアウトしました。";
      case "wallet-error":
        return `ウォレットがエラーを返しました: ${e.message}`;
      case "unavailable":
        return "この端末に接続情報を保存できませんでした。";
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
      <h3 className={styles.caption}>ウォレット接続（NWC）</h3>
      <p className={styles.desc}>
        Nostr Wallet Connect（NIP-47）で Lightning ウォレットを接続すると、Zap
        をアプリ内で完結できます。送金は毎回確認します。
      </p>
      {connection ? (
        <>
          <div className={styles.note}>
            <p className={styles.value}>ウォレット接続済み</p>
            <p className={styles.mono}>{`relay: ${connection.relayUrl}`}</p>
            <p className={styles.mono}>{`wallet: ${connection.walletPubkey.slice(0, 12)}…`}</p>
            {connection.lud16 && <p className={styles.mono}>{`lud16: ${connection.lud16}`}</p>}
            {connection.methods && <p className={styles.mono}>{`対応メソッド: ${connection.methods}`}</p>}
          </div>
          <button
            type="button"
            className={`${styles.danger} ${styles.alignStart}`}
            onClick={() => setConfirmDisconnect(true)}
          >
            接続を解除
          </button>
        </>
      ) : (
        <form className={styles.row} onSubmit={submit}>
          <label htmlFor={inputId} className="srOnly">
            NWC の接続文字列
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
              貼り付け
            </button>
          )}
          <button type="submit" className={styles.primary} disabled={busy || value.trim() === ""}>
            {busy ? "接続中…" : "接続"}
          </button>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </form>
      )}
      <p className={styles.desc}>
        接続文字列はウォレット側（Alby Hub、Coinos など）で発行できます。secret
        はこのブラウザ内に暗号化して保存されます。ログアウトすると消えます。
      </p>
      {confirmDisconnect && (
        <ConfirmDialog
          title="ウォレット接続を解除しますか？"
          text="保存済みの接続情報（secret を含む）をこのブラウザから削除します。"
          confirmLabel="接続を解除"
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
