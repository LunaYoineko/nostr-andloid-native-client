import type { NostrEvent } from "nostr-tools/pure";
import { Virtuoso } from "react-virtuoso";
import { NoteItem } from "../timeline/NoteItem";
import styles from "./ProfilePostList.module.css";

const NO_PINNED: NostrEvent[] = [];

/** Virtuoso の 1 行（先頭に固定投稿の見出しを挟む。ネイティブ notesItems の pin_label） */
type Row = { type: "pinnedLabel" } | { type: "pinned" | "post"; event: NostrEvent };

function rowsOf(pinned: readonly NostrEvent[], events: readonly NostrEvent[]): Row[] {
  const rows: Row[] = [];
  if (pinned.length > 0) {
    rows.push({ type: "pinnedLabel" });
    for (const event of pinned) rows.push({ type: "pinned", event });
  }
  for (const event of events) rows.push({ type: "post", event });
  return rows;
}

function rowKey(row: Row): string {
  return row.type === "pinnedLabel" ? "pin_label" : `${row.type}_${row.event.id}`;
}

/**
 * プロフィールのタブの中身（新しい順の投稿）。pinned（#531。その人の kind:10001）があれば
 * 「📌 固定された投稿」の見出し付きで先頭に出す（ネイティブ notesItems）。
 * scrollParent があればその要素のスクロールに乗る（Compact でヘッダカード・タブと一緒にスクロールする）。
 * 新着ピル・過去読みは無い（ネイティブと同じ）。
 */
export function ProfilePostList({
  events,
  loading,
  pinned = NO_PINNED,
  scrollParent,
}: {
  events: NostrEvent[];
  loading: boolean;
  pinned?: readonly NostrEvent[];
  scrollParent?: HTMLElement;
}) {
  const rows = rowsOf(pinned, events);
  return (
    <div role="tabpanel" id="profile-tabpanel" className={scrollParent ? undefined : styles.own}>
      {rows.length === 0 ? (
        <p className={styles.empty}>{loading ? "読み込み中…" : "まだ投稿がありません"}</p>
      ) : (
        <Virtuoso
          data={rows}
          computeItemKey={(_, row) => rowKey(row)}
          itemContent={(_, row) =>
            row.type === "pinnedLabel" ? (
              <p className={styles.pinnedLabel}>
                <span aria-hidden="true">📌</span> 固定された投稿
              </p>
            ) : (
              <NoteItem event={row.event} />
            )
          }
          customScrollParent={scrollParent}
          style={scrollParent ? undefined : { height: "100%" }}
        />
      )}
    </div>
  );
}
