import { Link } from "react-router";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { SingleColumnPane } from "../../ui/SingleColumnPane";
import { ComingSoon } from "./ComingSoon";
import styles from "./NotFoundScreen.module.css";

/** 未定義のパス。どのナビも選択表示しない */
export function NotFoundScreen() {
  return (
    <SingleColumnPane>
      <ScreenHeader title="ページが見つかりません" />
      <ComingSoon>
        <div>
          <p className={styles.text}>この URL に対応する画面はありません</p>
          <Link to="/" replace className={styles.link}>
            デッキへ戻る
          </Link>
        </div>
      </ComingSoon>
    </SingleColumnPane>
  );
}
