import { type ColumnSpec, defaultFilter } from "../../lib/columns";
import { Icon } from "../../ui/icons";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { SingleColumnPane } from "../../ui/SingleColumnPane";
import { useColumnFeed } from "../deck/useColumnFeed";
import { NotificationList } from "./NotificationList";
import styles from "./NotificationsScreen.module.css";

/**
 * 通知画面の購読（id はネイティブの購読 id と同じ。デッキには入れない）。
 * kinds は通知カラムの既定の種別だが、表示には使わない（viewFor が全種別を読む）。
 */
export const NOTIFICATIONS_SCREEN_SPEC: ColumnSpec = {
  id: "notifications",
  title: "通知",
  subtitle: "",
  kind: "NOTIFICATIONS",
  renderer: "FEED",
  filter: { ...defaultFilter(), kinds: [1, 7, 9735, 6] },
  pinned: false,
  order: 0,
};

/** 通知画面（/notifications。ネイティブの NotificationsScreen）。通知カラムと同じ一覧を 1 カラムで */
export function NotificationsScreen() {
  const { events, loading } = useColumnFeed(NOTIFICATIONS_SCREEN_SPEC);
  return (
    <SingleColumnPane>
      <ScreenHeader
        title="通知"
        subtitle="メンション・リアクション・リポスト"
        icon={<Icon name="notifications" size="lg" />}
      />
      <hr className={styles.divider} />
      <div className={styles.body}>
        <NotificationList events={events} loading={loading} />
      </div>
    </SingleColumnPane>
  );
}
