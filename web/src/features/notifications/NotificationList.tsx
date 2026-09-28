import type { NostrEvent } from "nostr-tools/pure";
import { useMemo, useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useSession } from "../../signer/session";
import { isMutedRevealed, useDeck } from "../../store/deck";
import { PullToRefreshIndicator } from "../../ui/PullToRefreshIndicator";
import { usePullToRefresh } from "../../ui/usePullToRefresh";
import { KbRow, useKbList } from "../keyboard/KbList";
import styles from "./NotificationList.module.css";
import { NotificationRow } from "./NotificationRow";
import { notificationsFrom, withDmNotices } from "./notificationModel";
import { useDmNotices } from "./useDmNotices";

/**
 * 通知の一覧（通知カラムと通知画面で共用。ネイティブの NotificationsBody）。新しい順に 1 件 1 行。
 * 未読のある DM 会話も 1 会話 1 行で時刻順に混ぜる（columnId のカラムで「ミュートを表示」中はミュートの相手も出す）。
 * 新着ピル・過去読みは無い（ネイティブと同じ）。
 * onRefresh を渡すと、タッチで上端から引っ張って離すと呼ぶ（#601 引っ張って更新。渡さなければ無効）。
 */
export function NotificationList({
  events,
  loading,
  columnId,
  onRefresh,
}: {
  events: NostrEvent[];
  loading: boolean;
  columnId: string;
  onRefresh?: () => void;
}) {
  const me = useSession((s) => s.pubkey);
  const revealed = useDeck((s) => isMutedRevealed(s, columnId));
  const dms = useDmNotices(me !== null, revealed);
  const items = useMemo(() => withDmNotices(notificationsFrom(events, me), dms), [events, me, dms]);
  const list = useRef<VirtuosoHandle>(null);
  // デッキのカラムならキー操作の対象にする（通知の行は r / t / f の対象外）
  useKbList(list, items.length);
  const { ref: scrollerRef, progress, refreshing } = usePullToRefresh(onRefresh);
  if (items.length === 0) {
    return (
      <div className={styles.root} ref={scrollerRef}>
        <PullToRefreshIndicator progress={progress} refreshing={refreshing} />
        <p className={styles.empty}>{loading ? "読み込み中…" : "通知はまだありません"}</p>
      </div>
    );
  }
  return (
    <div className={styles.root}>
      <PullToRefreshIndicator progress={progress} refreshing={refreshing} />
      <Virtuoso
        ref={list}
        className={styles.list}
        scrollerRef={scrollerRef}
        data={items}
        computeItemKey={(_, item) => item.id}
        itemContent={(index, item) => (
          <KbRow index={index}>
            <NotificationRow item={item} />
          </KbRow>
        )}
      />
    </div>
  );
}
