import { Link } from "react-router";
import { useT } from "../../i18n";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { SingleColumnPane } from "../../ui/SingleColumnPane";
import { ComingSoon } from "./ComingSoon";
import styles from "./NotFoundScreen.module.css";

/** 未定義のパス。どのナビも選択表示しない */
export function NotFoundScreen() {
  const t = useT();
  return (
    <SingleColumnPane>
      <ScreenHeader title={t("web_notfound_title")} />
      <ComingSoon>
        <div>
          <p className={styles.text}>{t("web_notfound_text")}</p>
          <Link to="/" replace className={styles.link}>
            {t("web_error_back_to_deck")}
          </Link>
        </div>
      </ComingSoon>
    </SingleColumnPane>
  );
}
