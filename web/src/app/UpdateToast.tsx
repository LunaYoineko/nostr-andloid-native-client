import { useRegisterSW } from "virtual:pwa-register/react";
import { useT } from "../i18n";
import styles from "./UpdateToast.module.css";

/**
 * Service Worker の登録と更新通知（vite-plugin-pwa の registerType: 'prompt'）。
 * 新しい SW が待機中なら再読み込みを促す。オフライン準備完了（offlineReady）は何も出さない。
 */
export function UpdateToast() {
  const t = useT();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div role="status" className={styles.toast}>
      <span className={styles.message}>{t("web_update_available")}</span>
      <button type="button" className={styles.reload} onClick={() => void updateServiceWorker(true)}>
        {t("web_update_reload")}
      </button>
      <button type="button" className={styles.close} onClick={() => setNeedRefresh(false)}>
        {t("common_close")}
      </button>
    </div>
  );
}
