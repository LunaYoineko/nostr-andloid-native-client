import { Virtuoso } from "react-virtuoso";
import { useT } from "../../i18n";
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
  const t = useT();
  const ids = useBookmarkedIds();
  const notes = useNotesByIds(ids);

  if (ids.length === 0) {
    return (
      <>
        <p className={styles.empty}>{t("bookmarks_empty")}</p>
        <p className={styles.hint}>{t("bookmarks_hint")}</p>
      </>
    );
  }
  if (notes.length === 0) {
    return <p className={styles.empty}>{t("bookmarks_loading_fmt", ids.length)}</p>;
  }
  return (
    <Virtuoso
      className={styles.list}
      aria-label={t("section_bookmarks")}
      data={notes}
      computeItemKey={(_, note) => note.id}
      itemContent={(_, note) => <NoteItem event={note} />}
    />
  );
}
