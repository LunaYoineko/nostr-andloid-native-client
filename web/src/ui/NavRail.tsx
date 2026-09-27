import type { ReactNode } from "react";
import { NAV_LABEL, type NavKey } from "../app/navState";
import type { ColumnKind } from "../lib/columns";
import { AccountAvatar } from "./AccountAvatar";
import { badgeText } from "./badge";
import { AddIcon, ChatIcon, ColumnKindIcon, HomeIcon, NotificationsIcon, SearchIcon } from "./icons";
import styles from "./NavRail.module.css";
import { RelayIndicator } from "./RelayIndicator";

export type RailPinned = { id: string; title: string; kind: ColumnKind; active: boolean };

/**
 * Expanded の左レール（ネイティブ DeckRail）。表示だけで、押したら各コールバック。
 * ブランド → ホーム ｜ ピン留めの目次（ここだけ縦スクロール）→ カラム追加 ｜ 検索 → メッセージ →（通知カラムが無いときだけ）通知 ｜
 * 接続表示 → 自分（設定）。投稿ボタンはレールに無い。badges = 宛先のアイコンの右上に重ねる未読数（0・未指定は出さない）。
 */
export function NavRail({
  selected,
  badges,
  homeActive,
  pinned,
  showNotifications,
  onSelect,
  onOpenColumn,
  onAddColumn,
}: {
  selected: Record<NavKey, boolean>;
  badges?: Partial<Record<NavKey, number>>;
  homeActive: boolean;
  pinned: RailPinned[];
  showNotifications: boolean;
  onSelect(key: NavKey): void;
  onOpenColumn(id: string): void;
  onAddColumn(): void;
}) {
  const dest = (key: NavKey, active: boolean, icon: ReactNode) => {
    const badge = badges?.[key] ?? 0;
    return (
      <button
        type="button"
        className={styles.slot}
        aria-label={badge > 0 ? `${NAV_LABEL[key]}（未読 ${badge} 件）` : NAV_LABEL[key]}
        title={NAV_LABEL[key]}
        aria-current={active ? "page" : undefined}
        onClick={() => onSelect(key)}
      >
        {icon}
        {badge > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {badgeText(badge)}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav className={styles.rail} aria-label="メイン">
      <div className={`${styles.block} ${styles.top}`}>
        <span className={styles.brandSlot}>
          <img
            src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
            alt="Nostrism"
            className={styles.brand}
          />
        </span>
        {dest("home", homeActive, <HomeIcon className={styles.icon} />)}
      </div>
      <div className={styles.divider} />
      <div className={styles.index}>
        {pinned.map((c) => (
          // 目次は選択時も色を変えず、下地だけ変える（ネイティブ）
          <button
            key={c.id}
            type="button"
            className={styles.slot}
            aria-label={c.title}
            title={c.title}
            aria-current={c.active ? "true" : undefined}
            onClick={() => onOpenColumn(c.id)}
          >
            <ColumnKindIcon kind={c.kind} className={styles.icon} />
          </button>
        ))}
      </div>
      {/* カラム追加は目次の外（スクロールしない。常に AccentWeak の下地） */}
      <button
        type="button"
        className={`${styles.slot} ${styles.add}`}
        aria-label="カラム追加"
        title="カラム追加"
        onClick={onAddColumn}
      >
        <AddIcon className={styles.icon} />
      </button>
      <div className={styles.divider} />
      <div className={styles.block}>
        {dest("search", selected.search, <SearchIcon className={styles.icon} />)}
        {dest("messages", selected.messages, <ChatIcon className={styles.icon} />)}
        {showNotifications &&
          dest("notifications", selected.notifications, <NotificationsIcon className={styles.icon} />)}
      </div>
      <div className={styles.divider} />
      <div className={`${styles.block} ${styles.bottom}`}>
        <RelayIndicator orientation="vertical" />
        {dest("settings", selected.settings, <AccountAvatar size={40} />)}
      </div>
    </nav>
  );
}
