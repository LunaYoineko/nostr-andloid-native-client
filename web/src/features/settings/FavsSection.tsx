import type { NostrEvent } from "nostr-tools/pure";
import { Virtuoso } from "react-virtuoso";
import { type ColumnSpec, defaultFilter } from "../../lib/columns";
import { MyReactionRow } from "../actions/MyReactionRow";
import { useColumnFeed } from "../deck/useColumnFeed";
import styles from "./FavsSection.module.css";

/** ふぁぼ欄カラムと同じ購読（自分の kind:7）。デッキには入れない */
const FAVS_SPEC: ColumnSpec = {
  id: "settings_favs",
  title: "ふぁぼ",
  subtitle: "自分のリアクション",
  kind: "FAVS",
  renderer: "FEED",
  filter: { ...defaultFilter(), kinds: [7] },
  pinned: false,
  order: 0,
};

type FooterContext = { loadingOlder: boolean };

function Footer({ context }: { context?: FooterContext }) {
  return context?.loadingOlder ? <p className={styles.more}>過去を読み込み中…</p> : null;
}

const COMPONENTS = { Footer };

/**
 * ふぁぼ（ネイティブ FavsSettings）。自分のリアクションを新しい順に、ふぁぼ欄カラムと同じ行（MyReactionRow）で並べる。
 * 下端で過去を読む（無限スクロール）。
 */
export function FavsSection() {
  const { loading, events, loadingOlder, loadOlder } = useColumnFeed(FAVS_SPEC);
  if (events.length === 0) {
    if (loading) return <p className={styles.empty}>読み込み中…</p>;
    return (
      <>
        <p className={styles.empty}>ふぁぼした投稿はまだありません。</p>
        <p className={styles.hint}>各投稿の ♡ でふぁぼできます。</p>
      </>
    );
  }
  return (
    <Virtuoso
      className={styles.list}
      aria-label="ふぁぼ"
      data={events}
      computeItemKey={(_, reaction) => reaction.id}
      endReached={loadOlder}
      components={COMPONENTS}
      context={{ loadingOlder }}
      itemContent={(_, reaction) => <FavItem reaction={reaction} />}
    />
  );
}

function FavItem({ reaction }: { reaction: NostrEvent }) {
  return <MyReactionRow reaction={reaction} />;
}
