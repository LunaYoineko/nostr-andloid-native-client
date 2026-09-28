import type { EventPointer } from "applesauce-core/helpers/pointers";
import type { NostrEvent } from "nostr-tools/pure";
import { useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { useNoteZaps, useZapReceipts } from "../zap/useZapReceipts";
import type { ZapItem } from "../zap/zapTotals";
import { CommentRootCard, GenericRootCard } from "./CommentRootCard";
import { FocusNoteStats } from "./FocusNoteStats";
import { ReplyBox } from "./ReplyBox";
import { ThreadRow } from "./ThreadRow";
import styles from "./ThreadScreen.module.css";
import { useThread } from "./useThread";
import { ZapRow } from "./ZapRow";

type CommentedZap = ZapItem & { sender: string };

type ListContext = { focus: NostrEvent | undefined; zaps: readonly CommentedZap[] };

/** ツリーの先頭のカード（コメント対象 / まだ表示できない kind の案内） */
function LeadCard({ focus }: { focus: NostrEvent | undefined }) {
  if (!focus) return null;
  if (focus.kind === 1111) return <CommentRootCard focus={focus} />;
  // 記事（kind:30023）のリーダーは M2
  if (focus.kind !== 1)
    return <GenericRootCard label={`kind ${focus.kind} の投稿は Web 版ではまだ表示できません`} />;
  return null;
}

function ListHeader({ context }: { context?: ListContext }) {
  return <LeadCard focus={context?.focus} />;
}

/** 返信の後のコメント付き Zap（新しい順。ネイティブ ThreadColumn と同じくコメント無しは行にしない） */
function ListFooter({ context }: { context?: ListContext }) {
  return context?.zaps.map((zap) => <ZapRow key={zap.id} zap={zap} />);
}

const COMPONENTS = { Header: ListHeader, Footer: ListFooter };

/**
 * スレッドの本文（ネイティブの ProfileScreen.kt ThreadDetail / ThreadColumn.kt ThreadColumn）。
 * root から深さ優先で並べ、起点の下に日時と反応を出す。返信の後にコメント付き Zap を返信風に並べる。
 * 起点へは自動スクロールしない（ネイティブと同じ）。
 * onReply があれば下端に返信ボックスを出す（起点、無ければ先頭の行への返信）。
 */
export function ThreadScreen({
  pointer,
  onReply,
}: {
  pointer: EventPointer;
  onReply?: (target: NostrEvent) => void;
}) {
  const { focus, entries, engagementEvents, loading } = useThread(pointer);
  // 起点への Zap 受領（kind:9735）
  useZapReceipts([pointer.id]);
  const zaps = useNoteZaps(pointer.id);
  const commented = useMemo(
    () => zaps.zaps.filter((z): z is CommentedZap => z.sender !== null && z.comment.trim() !== ""),
    [zaps],
  );
  const context = useMemo<ListContext>(() => ({ focus, zaps: commented }), [focus, commented]);
  const replyTarget = entries.find((e) => e.isFocused)?.event ?? entries[0]?.event;

  return (
    <div className={styles.screen}>
      <div className={styles.list}>
        {entries.length === 0 ? (
          <>
            <LeadCard focus={focus} />
            <p className={styles.empty}>{loading ? "読み込み中…" : "見つかりませんでした"}</p>
          </>
        ) : (
          <Virtuoso
            style={{ height: "100%" }}
            data={entries}
            context={context}
            components={COMPONENTS}
            computeItemKey={(_, entry) => entry.event.id}
            itemContent={(_, entry) => (
              <ThreadRow
                entry={entry}
                stats={
                  entry.isFocused ? (
                    <FocusNoteStats noteId={pointer.id} events={engagementEvents} zaps={zaps} />
                  ) : undefined
                }
              />
            )}
          />
        )}
      </div>
      {onReply && replyTarget && <ReplyBox onClick={() => onReply(replyTarget)} />}
    </div>
  );
}
