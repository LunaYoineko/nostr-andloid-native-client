import { useId, useState } from "react";
import { useT } from "../../i18n";
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
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>{t("web_settings_cache_title")}</h3>
      <p className={styles.desc}>{t("web_settings_cache_desc")}</p>
      <button
        type="button"
        className={`${styles.danger} ${styles.alignStart}`}
        onClick={() => setConfirming(true)}
      >
        {t("data_purge_button")}
      </button>
      {confirming && (
        <ConfirmDialog
          title={t("data_purge_title")}
          text={t("web_data_purge_text")}
          confirmLabel={t("data_purge_confirm")}
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
  const t = useT();
  const enabled = useDeveloperMode((s) => s.enabled);
  const id = useId();
  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>{t("dev_mode_title")}</h3>
      <p className={styles.desc}>{t("dev_mode_desc")}</p>
      <label className={styles.check} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={enabled}
          onChange={(e) => setDeveloperMode(e.target.checked)}
        />
        {t("dev_mode_toggle")}
      </label>
    </div>
  );
}

/**
 * web+nostr: リンクをこのアプリで開く（#541。manifest の protocol_handlers と一致する URL を登録する）。
 * registerProtocolHandler が無いブラウザでは出さない。
 */
function ProtocolHandlerBlock() {
  const t = useT();
  if (!("registerProtocolHandler" in navigator)) return null;
  return (
    <div className={styles.block}>
      <h3 className={styles.caption}>{t("web_settings_nostr_link_title")}</h3>
      <p className={styles.desc}>{t("web_settings_nostr_link_desc")}</p>
      <button
        type="button"
        className={`${styles.ghost} ${styles.alignStart}`}
        onClick={() => {
          try {
            navigator.registerProtocolHandler("web+nostr", "/open?uri=%s");
            showToast(t("web_data_handler_registered"));
          } catch {
            showToast(t("web_data_handler_failed"));
          }
        }}
      >
        {t("web_settings_nostr_link_toggle")}
      </button>
    </div>
  );
}

/** 接続と通信量（ネイティブ ConnectionMonitorDialog #364）への入口 */
function ConnectionMonitorBlock() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const developerMode = useDeveloperMode((s) => s.enabled);
  // [#364] 開発者モード ON のときだけ導線を出す（ネイティブと同じ。S13）
  if (!developerMode) return null;
  return (
    <div className={styles.block}>
      <button type="button" className={`${styles.ghost} ${styles.alignStart}`} onClick={() => setOpen(true)}>
        {t("conn_monitor_open")}
      </button>
      {open && <ConnectionMonitorDialog onDismiss={() => setOpen(false)} />}
    </div>
  );
}
