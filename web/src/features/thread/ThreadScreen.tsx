import type { EventPointer } from "applesauce-core/helpers/pointers";
import type { NostrEvent } from "nostr-tools/pure";
import { useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { CommentRootCard, GenericRootCard } from "./CommentRootCard";
import { FocusNoteStats } from "./FocusNoteStats";
import { ReplyBox } from "./ReplyBox";
import { ThreadRow } from "./ThreadRow";
import styles from "./ThreadScreen.module.css";
import { useThread } from "./useThread";

type HeaderContext = { focus: NostrEvent | undefined };

/** ツリーの先頭のカード（コメント対象 / まだ表示できない kind の案内） */
function LeadCard({ focus }: { focus: NostrEvent | undefined }) {
  if (!focus) return null;
  if (focus.kind === 1111) return <CommentRootCard focus={focus} />;
  // 記事（kind:30023）のリーダーは M2
  if (focus.kind !== 1)
    return <GenericRootCard label={`kind ${focus.kind} の投稿は Web 版ではまだ表示できません`} />;
  return null;
}

function ListHeader({ context }: { context?: HeaderContext }) {
  return <LeadCard focus={context?.focus} />;
}

const COMPONENTS = { Header: ListHeader };

/**
 * スレッドの本文（ネイティブの ProfileScreen.kt ThreadDetail / ThreadColumn.kt ThreadColumn）。
 * root から深さ優先で並べ、起点の下に日時と反応を出す。起点へは自動スクロールしない（ネイティブと同じ）。
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
  const context = useMemo<HeaderContext>(() => ({ focus }), [focus]);
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
                    <FocusNoteStats noteId={pointer.id} events={engagementEvents} />
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
