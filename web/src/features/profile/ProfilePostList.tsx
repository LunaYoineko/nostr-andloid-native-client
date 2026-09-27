import type { NostrEvent } from "nostr-tools/pure";
import { Virtuoso } from "react-virtuoso";
import { NoteItem } from "../timeline/NoteItem";
import styles from "./ProfilePostList.module.css";

/**
 * プロフィールのタブの中身（新しい順の投稿）。scrollParent があればその要素のスクロールに乗る（Compact で
 * ヘッダカード・タブと一緒にスクロールする）。新着ピル・過去読みは無い（ネイティブと同じ）。
 */
export function ProfilePostList({
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
        <p className={styles.empty}>{loading ? "読み込み中…" : "まだ投稿がありません"}</p>
      ) : (
        <Virtuoso
          data={events}
          computeItemKey={(_, e) => e.id}
          itemContent={(_, e) => <NoteItem event={e} />}
          customScrollParent={scrollParent}
          style={scrollParent ? undefined : { height: "100%" }}
        />
      )}
    </div>
  );
}
