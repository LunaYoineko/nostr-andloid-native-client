import { Virtuoso } from "react-virtuoso";
import { useNotesByIds } from "../lists/notesByIds";
import { useBookmarkedIds } from "../lists/ownLists";
import { NoteItem } from "../timeline/NoteItem";
import styles from "./BookmarksSection.module.css";

/**
 * ブックマーク（ネイティブ SettingsScreen.kt BookmarkSettings。#531）。自分の kind:10003 の e タグを
 * 追加の新しい順（末尾が上）に、通常のカラムと同じ NoteItem で並べる。購読は起動時から
 * （ownLists.ts の startOwnLists）張ったままなので、ここでは購読しない。
 */
export function BookmarksSection() {
  const ids = useBookmarkedIds();
  const notes = useNotesByIds(ids);

  if (ids.length === 0) {
    return (
      <>
        <p className={styles.empty}>ブックマークはまだありません。</p>
        <p className={styles.hint}>各投稿の ⋯ メニュー →「ブックマーク」で追加できます。</p>
      </>
    );
  }
  if (notes.length === 0) {
    return <p className={styles.empty}>{`リレーから取得中…（${ids.length}件）`}</p>;
  }
  return (
    <Virtuoso
      className={styles.list}
      aria-label="ブックマーク"
      data={notes}
      computeItemKey={(_, note) => note.id}
      itemContent={(_, note) => <NoteItem event={note} />}
    />
  );
}
