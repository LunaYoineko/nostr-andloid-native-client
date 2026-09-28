import { naddrEncode } from "nostr-tools/nip19";
import type { NostrEvent } from "nostr-tools/pure";
import { Link } from "react-router";
import { Virtuoso } from "react-virtuoso";
import { hrefForEvent } from "../../lib/content/labels";
import { ArticleCardBody } from "../article/ArticleCard";
import cardStyles from "../article/ArticleCard.module.css";
import styles from "./ProfilePostList.module.css";

function hrefForArticle(event: NostrEvent): string {
  const d = event.tags.find((t) => t[0] === "d" && typeof t[1] === "string")?.[1] ?? "";
  return hrefForEvent(naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: d }));
}

/**
 * [#534] プロフィールの「記事」タブの中身（本人の kind:30023。新しい順）。行は本文の記事カードと同じ見た目
 * （ArticleCardBody）。0 件でもタブ自体は出す（ネイティブ #384）ので、ここは空メッセージだけ描く。
 */
export function ProfileArticleList({
  events,
  loading,
  scrollParent,
}: {
  events: NostrEvent[];
  loading: boolean;
  scrollParent?: HTMLElement;
}) {
  return (
    <div role="tabpanel" id="profile-tabpanel" className={scrollParent ? undefined : styles.own}>
      {events.length === 0 ? (
        <p className={styles.empty}>{loading ? "読み込み中…" : "まだ記事がありません"}</p>
      ) : (
        <Virtuoso
          data={events}
          computeItemKey={(_, event) => event.id}
          itemContent={(_, event) => (
            <div className={cardStyles.row}>
              <Link className={cardStyles.card} to={hrefForArticle(event)}>
                <ArticleCardBody event={event} />
              </Link>
            </div>
          )}
          customScrollParent={scrollParent}
          style={scrollParent ? undefined : { height: "100%" }}
        />
      )}
    </div>
  );
}
