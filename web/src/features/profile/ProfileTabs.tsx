import { useT } from "../../i18n";
import styles from "./ProfileTabs.module.css";

export type ProfileTab = "posts" | "media" | "articles" | "lists";

const TABS: readonly ProfileTab[] = ["posts", "media", "articles", "lists"];

function tabLabel(t: ReturnType<typeof useT>, key: ProfileTab): string {
  switch (key) {
    case "posts":
      return t("tab_posts");
    case "media":
      return t("tab_media");
    case "articles":
      return t("tab_articles");
    case "lists":
      return t("tab_lists");
  }
}

/**
 * プロフィールのタブ（ネイティブ ProfileTabs）。投稿（返信込み）/ メディア / 記事（#534。kind:30023。0 件でも出す）/
 * リスト（#530。NIP-51 セット）。sticky = スクロールで上端に張り付く（Compact）。
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
  const t = useT();
  return (
    <div role="tablist" aria-label={t("web_profile_tabs_label")} className={styles.tabs} data-sticky={sticky}>
      {TABS.map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          id={`profile-tab-${key}`}
          aria-selected={tab === key}
          aria-controls="profile-tabpanel"
          className={styles.tab}
          onClick={() => onChange(key)}
        >
          <span className={styles.label}>{tabLabel(t, key)}</span>
          <span className={styles.bar} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
