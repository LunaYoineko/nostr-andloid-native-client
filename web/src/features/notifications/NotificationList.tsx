import type { NostrEvent } from "nostr-tools/pure";
import { useMemo, useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useSession } from "../../signer/session";
import { KbRow, useKbList } from "../keyboard/KbList";
import styles from "./NotificationList.module.css";
import { NotificationRow } from "./NotificationRow";
import { notificationsFrom } from "./notificationModel";

/**
 * 通知の一覧（通知カラムと通知画面で共用。ネイティブの NotificationsBody）。新しい順に 1 件 1 行。
 * 新着ピル・過去読みは無い（ネイティブと同じ）。
 */
export function NotificationList({ events, loading }: { events: NostrEvent[]; loading: boolean }) {
  const me = useSession((s) => s.pubkey);
  const items = useMemo(() => notificationsFrom(events, me), [events, me]);
  const list = useRef<VirtuosoHandle>(null);
  // デッキのカラムならキー操作の対象にする（通知の行は r / t / f の対象外）
  useKbList(list, items.length);
  if (items.length === 0) {
    return <p className={styles.empty}>{loading ? "読み込み中…" : "通知はまだありません"}</p>;
  }
  return (
    <Virtuoso
      ref={list}
      className={styles.list}
      data={items}
      computeItemKey={(_, item) => item.id}
      itemContent={(index, item) => (
        <KbRow index={index}>
          <NotificationRow item={item} />
        </KbRow>
      )}
    />
  );
}
