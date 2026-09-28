import { useEffect } from "react";
import { useRouteError } from "react-router";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { ComingSoon } from "./ComingSoon";
import styles from "./RouteError.module.css";

/** ルートの errorElement。Router の外でも動くよう、戻り先は素の <a> */
export function RouteError() {
  const error = useRouteError();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className={styles.page}>
      <ScreenHeader title="エラーが発生しました" />
      <ComingSoon>
        <div className={styles.actions}>
          <button type="button" className={styles.reload} onClick={() => window.location.reload()}>
            再読み込み
          </button>
          <a href="/app/" className={styles.link}>
            デッキへ戻る
          </a>
        </div>
      </ComingSoon>
    </div>
  );
}
