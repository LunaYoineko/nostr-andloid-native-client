import type { NostrEvent } from "nostr-tools/pure";
import { useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { useT } from "../../i18n";
import { type ColumnSpec, defaultFilter } from "../../lib/columns";
import { MyReactionRow } from "../actions/MyReactionRow";
import { useColumnFeed } from "../deck/useColumnFeed";
import styles from "./FavsSection.module.css";

/** ふぁぼ欄カラムと同じ購読（自分の kind:7）。デッキには入れない */
const FAVS_SPEC: Omit<ColumnSpec, "title" | "subtitle"> = {
  id: "settings_favs",
  kind: "FAVS",
  renderer: "FEED",
  filter: { ...defaultFilter(), kinds: [7] },
  pinned: false,
  order: 0,
};

type FooterContext = { loadingOlder: boolean };

function Footer({ context }: { context?: FooterContext }) {
  const t = useT();
  return context?.loadingOlder ? <p className={styles.more}>{t("feed_loading_older")}</p> : null;
}

const COMPONENTS = { Footer };

/**
 * ふぁぼ（ネイティブ FavsSettings）。自分のリアクションを新しい順に、ふぁぼ欄カラムと同じ行（MyReactionRow）で並べる。
 * 下端で過去を読む（無限スクロール）。
 */
export function FavsSection() {
  const t = useT();
  const spec = useMemo(
    () => ({ ...FAVS_SPEC, title: t("section_favs"), subtitle: t("sub_my_reactions") }),
    [t],
  );
  const { loading, events, loadingOlder, loadOlder } = useColumnFeed(spec);
  if (events.length === 0) {
    if (loading) return <p className={styles.empty}>{t("loading")}</p>;
    return (
      <>
        <p className={styles.empty}>{t("favs_empty")}</p>
        <p className={styles.hint}>{t("favs_hint")}</p>
      </>
    );
  }
  return (
    <Virtuoso
      className={styles.list}
      aria-label={t("section_favs")}
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
