import { useId, useState } from "react";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { showToast } from "../../ui/toast";
import { RelaySyncSection } from "../sync/RelaySyncSection";
import { ConnectionMonitorDialog } from "./ConnectionMonitorDialog";
import { clearCacheAndReload } from "./cache";
import { setDeveloperMode, useDeveloperMode } from "./devMode";
import styles from "./SettingsSections.module.css";

/**
 * データ・キャッシュ（ネイティブ DataSettings の並び: リレー同期[#468] → キャッシュの強制消去 →
 * 開発者モード → 接続と通信量 → web+nostr: リンクの登録[#541]）。
 */
export function DataSection() {
  return (
    <>
      <RelaySyncSection />
      <PurgeCacheBlock />
      <DeveloperModeBlock />
      <ConnectionMonitorBlock />
      <ProtocolHandlerBlock />
    </>
  );
}

/** キャッシュの強制消去（ネイティブ purgeCache）。確認のうえ消して再読み込みする */
function PurgeCacheBlock() {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>キャッシュ</h3>
      <p className={styles.desc}>
        端末内に保存しているキャッシュ（タイムライン履歴・プロフィール・送信待ち・リンクカード）をすべて消去し、再読み込みしてリレーから取り直します。DM
        の復号済みメッセージも消えます。NIP-07 / NIP-46
        では次に開いたとき再び承認を求められます。鍵・リレー・カラムの設定は保持されます。
      </p>
      <button
        type="button"
        className={`${styles.danger} ${styles.alignStart}`}
        onClick={() => setConfirming(true)}
      >
        キャッシュを強制消去
      </button>
      {confirming && (
        <ConfirmDialog
          title="キャッシュを消去しますか？"
          text="保存済みのイベント・プロフィール・送信待ち・リンクカードをすべて削除し、再読み込みしてリレーから取り直します。DM の復号済みメッセージも消えます。NIP-07 / NIP-46 では次に開いたとき再び承認を求められます。鍵・リレー・カラムの設定は消えません。この操作は元に戻せません。"
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

/** 開発者モード（ネイティブ #351）。ON で投稿の ⋯ に「イベントJSONを表示」 */
function DeveloperModeBlock() {
  const enabled = useDeveloperMode((s) => s.enabled);
  const id = useId();
  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>開発者モード</h3>
      <p className={styles.desc}>
        投稿やチャットの「⋯」メニューに「イベントJSONを表示」が追加され、タイムラインに流れてくるイベントの生データを確認できます。
      </p>
      <label className={styles.check} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={enabled}
          onChange={(e) => setDeveloperMode(e.target.checked)}
        />
        開発者モードを有効にする
      </label>
    </div>
  );
}

/**
 * web+nostr: リンクをこのアプリで開く（#541。manifest の protocol_handlers と一致する URL を登録する）。
 * registerProtocolHandler が無いブラウザでは出さない。
 */
function ProtocolHandlerBlock() {
  if (!("registerProtocolHandler" in navigator)) return null;
  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>nostr: リンク</h3>
      <p className={styles.desc}>
        他のサイトの nostr: リンク（npub / nprofile / note / nevent /
        naddr）をこのアプリで開けるようにします。
      </p>
      <button
        type="button"
        className={`${styles.ghost} ${styles.alignStart}`}
        onClick={() => {
          try {
            navigator.registerProtocolHandler("web+nostr", "/open?uri=%s");
            showToast("登録しました");
          } catch {
            showToast("登録できませんでした");
          }
        }}
      >
        nostr: リンクをこのアプリで開く
      </button>
    </div>
  );
}

/** 接続と通信量（ネイティブ ConnectionMonitorDialog #364）への入口 */
function ConnectionMonitorBlock() {
  const [open, setOpen] = useState(false);
  const developerMode = useDeveloperMode((s) => s.enabled);
  // [#364] 開発者モード ON のときだけ導線を出す（ネイティブと同じ。S13）
  if (!developerMode) return null;
  return (
    <div className={styles.block}>
      <button type="button" className={`${styles.ghost} ${styles.alignStart}`} onClick={() => setOpen(true)}>
        接続と通信量を表示
      </button>
      {open && <ConnectionMonitorDialog onDismiss={() => setOpen(false)} />}
    </div>
  );
}
