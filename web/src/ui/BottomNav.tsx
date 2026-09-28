import { NAV_LABEL, NAV_ORDER, type NavKey } from "../app/navState";
import { AccountAvatar } from "./AccountAvatar";
import styles from "./BottomNav.module.css";
import { badgeText } from "./badge";
import { ChatIcon, HomeIcon, NotificationsIcon, SearchIcon } from "./icons";

function NavIcon({ navKey }: { navKey: NavKey }) {
  switch (navKey) {
    case "home":
      return <HomeIcon className={styles.icon} />;
    case "search":
      return <SearchIcon className={styles.icon} />;
    case "messages":
      return <ChatIcon className={styles.icon} />;
    case "notifications":
      return <NotificationsIcon className={styles.icon} />;
    case "settings":
      return <AccountAvatar size={24} />;
  }
}

/**
 * Compact の下部ナビ（ネイティブ BottomBar）。固定 5 枠・ラベル無し。表示だけで、押したら onSelect。
 * badges = アイコンの右上に重ねる未読数（0・未指定は出さない）
 */
export function BottomNav({
  selected,
  badges,
  onSelect,
}: {
  selected: Record<NavKey, boolean>;
  badges?: Partial<Record<NavKey, number>>;
  onSelect(key: NavKey): void;
}) {
  return (
    <nav className={styles.nav} aria-label="メイン">
      {NAV_ORDER.map((key) => {
        const badge = badges?.[key] ?? 0;
        return (
          <button
            key={key}
            type="button"
            className={styles.item}
            aria-label={badge > 0 ? `${NAV_LABEL[key]}（未読 ${badge} 件）` : NAV_LABEL[key]}
            title={NAV_LABEL[key]}
            aria-current={selected[key] ? "page" : undefined}
            onClick={() => onSelect(key)}
          >
            <span className={styles.indicator}>
              <NavIcon navKey={key} />
              {badge > 0 && (
                <span className={styles.badge} aria-hidden="true">
                  {badgeText(badge)}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
