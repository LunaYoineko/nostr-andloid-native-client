import type { NostrEvent } from "nostr-tools/pure";
import { useCallback, useRef, useState } from "react";
import { type ListRange, Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { KbRow, useKbList } from "../keyboard/KbList";
import { NoteItem } from "./NoteItem";
import styles from "./Timeline.module.css";

// 先頭へ新着を差し込むたびに減らす仮想インデックスの起点（react-virtuoso の firstItemIndex は正の数）
const START_INDEX = 1_000_000_000;
// 先頭から 40px 以内なら「先頭にいる」とみなす（ネイティブの NewItemsPill.kt と同じ）
const AT_TOP_THRESHOLD = 40;
// 先頭に見えている投稿がこの位置以降なら、新着が無くても「最新へ戻る」を出す（ネイティブの rememberScrolledAway と同じ 3）
const SCROLLED_AWAY_INDEX = 3;

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

type FooterContext = { loadingOlder: boolean };

/** 末尾の「過去を読み込み中…」 */
function OlderFooter({ context }: { context?: FooterContext }) {
  return context?.loadingOlder ? <p className={styles.empty}>過去を読み込み中…</p> : null;
}

const COMPONENTS = { Footer: OlderFooter };

/**
 * 新しい順のタイムライン（仮想リスト）。
 * 先頭付近にいれば新着はそのまま上から流れ、読み進めている間は位置を保って「↑ N 件の新着」を出す。
 * 新着が無くても 3 件目以降まで下りていれば「↑ 最新へ戻る」を出す（ネイティブの FeedTopPill。ピルは 1 つにまとめる）。
 * 末尾まで来たら onEndReached（過去読み）を呼ぶ。
 */
export function Timeline({
  events,
  loading,
  onEndReached,
  loadingOlder = false,
  emptyText = "まだ投稿がありません",
}: {
  events: NostrEvent[];
  loading: boolean;
  onEndReached?: () => void;
  loadingOlder?: boolean;
  emptyText?: string;
}) {
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

  // range の番号は firstItemIndex を足した値なので、先頭からの位置に直して比べる
  const [scrolledAway, setScrolledAway] = useState(false);
  const firstItemIndex = anchor.firstItemIndex;
  const onRangeChanged = useCallback(
    (range: ListRange) => setScrolledAway(range.startIndex - firstItemIndex >= SCROLLED_AWAY_INDEX),
    [firstItemIndex],
  );

  // デッキのカラムならキー操作（j / k 等）の対象にする
  useKbList(list, events.length, (index) => events[index]);

  const newCount = atTop ? 0 : positionOf(events, anchor.seenTopId);
  const pill = newCount > 0 ? `${newCount} 件の新着` : scrolledAway ? "最新へ戻る" : null;

  if (events.length === 0) {
    return <p className={styles.empty}>{loading ? "読み込み中…" : emptyText}</p>;
  }

  return (
    <div className={styles.timeline}>
      {pill !== null && (
        <button
          type="button"
          className={styles.pill}
          onClick={() => list.current?.scrollTo({ top: 0, behavior: "smooth" })}
        >
          ↑ {pill}
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
        rangeChanged={onRangeChanged}
        endReached={onEndReached}
        components={COMPONENTS}
        context={{ loadingOlder }}
        itemContent={(index, event) => (
          <KbRow index={index - firstItemIndex}>
            <NoteItem event={event} />
          </KbRow>
        )}
      />
    </div>
  );
}
