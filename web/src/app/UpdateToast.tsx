import { useRegisterSW } from "virtual:pwa-register/react";
import styles from "./UpdateToast.module.css";

/**
 * Service Worker の登録と更新通知（vite-plugin-pwa の registerType: 'prompt'）。
 * 新しい SW が待機中なら再読み込みを促す。オフライン準備完了（offlineReady）は何も出さない。
 */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div role="status" className={styles.toast}>
      <span className={styles.message}>新しいバージョンがあります</span>
      <button type="button" className={styles.reload} onClick={() => void updateServiceWorker(true)}>
        再読み込み
      </button>
      <button type="button" className={styles.close} onClick={() => setNeedRefresh(false)}>
        閉じる
      </button>
    </div>
  );
}
