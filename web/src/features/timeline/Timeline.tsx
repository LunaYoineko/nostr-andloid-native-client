import type { NostrEvent } from "nostr-tools/pure";
import { useCallback, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { NoteItem } from "./NoteItem";
import styles from "./Timeline.module.css";

// 先頭へ新着を差し込むたびに減らす仮想インデックスの起点（react-virtuoso の firstItemIndex は正の数）
const START_INDEX = 1_000_000_000;
// 先頭から 40px 以内なら「先頭にいる」とみなす（ネイティブの NewItemsPill.kt と同じ）
const AT_TOP_THRESHOLD = 40;

/** 投稿の位置 = それより上にある件数（見つからなければ 0） */
function positionOf(events: NostrEvent[], id: string | undefined): number {
  const index = events.findIndex((e) => e.id === id);
  return index < 0 ? 0 : index;
}

type Anchor = {
  /** 前回描画時の先頭の投稿 */
  topId: string | undefined;
  firstItemIndex: number;
  /** 最後に先頭で見た投稿。これより上に積まれた件数を新着として数える */
  seenTopId: string | undefined;
};

/**
 * 新しい順のタイムライン（仮想リスト）。
 * 先頭付近にいれば新着はそのまま上から流れ、読み進めている間は位置を保って「↑ N 件の新着」を出す。
 */
export function Timeline({ events, loading }: { events: NostrEvent[]; loading: boolean }) {
  const list = useRef<VirtuosoHandle>(null);
  const [atTop, setAtTop] = useState(true);
  const topId = events[0]?.id;
  const [anchor, setAnchor] = useState<Anchor>({
    topId,
    firstItemIndex: START_INDEX,
    seenTopId: topId,
  });

  // 先頭が変わったら描画前に位置を合わせる（firstItemIndex とデータは同じ描画で変える必要がある）
  if (anchor.topId !== topId) {
    // 先頭付近にいるときはずらさない = 新着がそのまま見える位置に入る
    const prepended = atTop ? 0 : positionOf(events, anchor.topId);
    setAnchor({
      topId,
      firstItemIndex: anchor.firstItemIndex - prepended,
      seenTopId: atTop ? topId : anchor.seenTopId,
    });
  }

  const onAtTopChange = useCallback((value: boolean) => {
    setAtTop(value);
    if (value) setAnchor((a) => ({ ...a, seenTopId: a.topId }));
  }, []);

  const newCount = atTop ? 0 : positionOf(events, anchor.seenTopId);

  if (events.length === 0) {
    return <p className={styles.empty}>{loading ? "読み込み中…" : "まだ投稿がありません"}</p>;
  }

  return (
    <div className={styles.timeline}>
      {newCount > 0 && (
        <button
          type="button"
          className={styles.pill}
          onClick={() => list.current?.scrollTo({ top: 0, behavior: "smooth" })}
        >
          ↑ {newCount} 件の新着
        </button>
      )}
      <Virtuoso
        ref={list}
        className={styles.list}
        data={events}
        firstItemIndex={anchor.firstItemIndex}
        computeItemKey={(_, event) => event.id}
        atTopThreshold={AT_TOP_THRESHOLD}
        atTopStateChange={onAtTopChange}
        itemContent={(_, event) => <NoteItem event={event} />}
      />
    </div>
  );
}
