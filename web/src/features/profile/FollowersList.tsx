import { Virtuoso } from "react-virtuoso";
import { useT } from "../../i18n";
import { ScreenHeader } from "../../ui/ScreenHeader";
import own from "./FollowersList.module.css";
import { UserRow } from "./FollowingList";
import styles from "./FollowingList.module.css";
import type { FollowersState } from "./followers";

type FooterContext = { hasMore: boolean; loading: boolean; onLoadMore: () => void };

/** 末尾の「さらに読み込む」（続きがあり得る間だけ。取得中は「集計中…」） */
function LoadMoreFooter({ context }: { context?: FooterContext }) {
  const t = useT();
  if (!context || (!context.hasMore && !context.loading)) return null;
  return (
    <div className={own.more}>
      <button
        type="button"
        className={own.moreButton}
        disabled={context.loading}
        onClick={context.onLoadMore}
      >
        {context.loading ? t("aggregating") : t("load_more")}
      </button>
    </div>
  );
}

const COMPONENTS = { Footer: LoadMoreFooter };

/**
 * フォロワーの一覧（ネイティブ UserListScreen の FOLLOWERS）。見た目はフォロー中の一覧と同じで、
 * 見出しの下に「観測できた範囲のみ」の注記を出す。行を押すとその人のプロフィール。
 */
export function FollowersList({
  state,
  onLoadMore,
  onBack,
}: {
  state: FollowersState;
  onLoadMore: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const { followers, hasMore, loading } = state;
  return (
    <div className={styles.screen}>
      <ScreenHeader title={t("list_followers")} onBack={onBack} />
      <hr className={styles.divider} />
      <p className={own.note}>{t("followers_scope_note")}</p>
      <hr className={styles.divider} />
      {followers === null ? (
        <p className={styles.empty}>{t("aggregating")}</p>
      ) : followers.length === 0 && !hasMore ? (
        <p className={styles.empty}>{t("not_found")}</p>
      ) : (
        <Virtuoso
          data={followers}
          computeItemKey={(_, pk) => pk}
          itemContent={(_, pk) => <UserRow pubkey={pk} />}
          components={COMPONENTS}
          context={{ hasMore, loading, onLoadMore }}
          style={{ flex: 1 }}
        />
      )}
    </div>
  );
}
