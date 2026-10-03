import { useEffect } from "react";
import { useRouteError } from "react-router";
import { useT } from "../../i18n";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { ComingSoon } from "./ComingSoon";
import styles from "./RouteError.module.css";

/** ルートの errorElement。Router の外でも動くよう、戻り先は素の <a> */
export function RouteError() {
  const t = useT();
  const error = useRouteError();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className={styles.page}>
      <ScreenHeader title={t("web_error_title")} />
      <ComingSoon>
        <div className={styles.actions}>
          <button type="button" className={styles.reload} onClick={() => window.location.reload()}>
            {t("web_update_reload")}
          </button>
          <a href="/" className={styles.link}>
            {t("web_error_back_to_deck")}
          </a>
        </div>
      </ComingSoon>
    </div>
  );
}
