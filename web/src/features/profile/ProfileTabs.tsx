import styles from "./ProfileTabs.module.css";

export type ProfileTab = "posts" | "media" | "articles";

const TABS: readonly { key: ProfileTab; label: string }[] = [
  { key: "posts", label: "投稿" },
  { key: "media", label: "メディア" },
  { key: "articles", label: "記事" },
];

/**
 * プロフィールのタブ（ネイティブ ProfileTabs）。投稿（返信込み）/ メディア / 記事（#534。kind:30023。0 件でも出す）。
 * リストは #530。sticky = スクロールで上端に張り付く（Compact）。
 */
export function ProfileTabs({
  tab,
  onChange,
  sticky = false,
}: {
  tab: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  sticky?: boolean;
}) {
  return (
    <div role="tablist" aria-label="プロフィールのタブ" className={styles.tabs} data-sticky={sticky}>
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          id={`profile-tab-${t.key}`}
          aria-selected={tab === t.key}
          aria-controls="profile-tabpanel"
          className={styles.tab}
          onClick={() => onChange(t.key)}
        >
          <span className={styles.label}>{t.label}</span>
          <span className={styles.bar} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
