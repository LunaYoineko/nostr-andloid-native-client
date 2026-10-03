import type { EventPointer } from "applesauce-core/helpers/pointers";
import { useState } from "react";
import { useT } from "../../i18n";
import { buildListColumn } from "../../lib/columns";
import { proxied } from "../../lib/imageProxy";
import { unixNow } from "../../lib/time";
import { useEventByPointer } from "../../nostr/loaders";
import { useDeck } from "../../store/deck";
import { NoteItem } from "../timeline/NoteItem";
import { UserRow } from "./FollowingList";
import styles from "./ListsTab.module.css";
import type { Nip51Set } from "./nip51";
import { nip51SetAddress, nip51SetCount } from "./nip51";
import { useProfileLists } from "./useProfileLists";

/** 展開時に一度に描くメンバー / ブックマークの上限（ネイティブ LIST_MEMBERS_SHOWN / LIST_NOTES_SHOWN） */
export const LIST_MEMBERS_SHOWN = 200;
export const LIST_NOTES_SHOWN = 30;

/**
 * タブ「リスト」（ネイティブ ProfileScreen の listSetItems）。本人の NIP-51 セットを新しい順に並べ、
 * 行を押すと展開する: フォローセット(30000) はメンバー一覧 + 「カラムで開く」、ブックマークセット(30003) は
 * 対象の投稿（イベント id）。a タグ（記事等）は件数には数えるが、記事タブが無いのでここでは出さない（#534）。
 */
export function ListsTab({ pubkey }: { pubkey: string }) {
  const t = useT();
  const { loading, sets } = useProfileLists(pubkey);
  return (
    <div role="tabpanel" id="profile-tabpanel" className={styles.own}>
      {sets.length === 0 ? (
        <p className={styles.empty}>{loading ? t("loading") : t("profile_no_lists")}</p>
      ) : (
        <ul className={styles.list}>
          {sets.map((set) => (
            <ListSetRow key={nip51SetAddress(set)} set={set} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ListSetRow({ set }: { set: Nip51Set }) {
  const [open, setOpen] = useState(false);
  const address = nip51SetAddress(set);
  return (
    <li className={styles.row}>
      <button type="button" className={styles.head} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {set.image && <img className={styles.image} src={proxied(set.image, 80)} alt="" />}
        <span className={styles.texts}>
          <span className={styles.title}>{set.title}</span>
          <span className={styles.count}>{`${nip51SetCount(set)} 件`}</span>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className={styles.body}>
          {set.kind === 30000 ? (
            <>
              {set.members.length > 0 && (
                <button
                  type="button"
                  className={styles.openColumn}
                  onClick={() =>
                    useDeck.getState().openTransient(buildListColumn(set.title, set.members, unixNow()))
                  }
                >
                  カラムで開く
                </button>
              )}
              {set.members.slice(0, LIST_MEMBERS_SHOWN).map((pk) => (
                <UserRow key={pk} pubkey={pk} />
              ))}
            </>
          ) : (
            set.eventIds
              .slice(0, LIST_NOTES_SHOWN)
              .map((id) => <BookmarkedNote key={`${address}_${id}`} id={id} />)
          )}
          {set.hasPrivate && (
            <p className={styles.privateNote}>
              このリストには非公開の項目があります（本人以外は読めません）。
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** ブックマークセットの 1 件（イベント id を解決して投稿として描く。届くまではネイティブと同じ md_resolving。P5） */
function BookmarkedNote({ id }: { id: string }) {
  const t = useT();
  const pointer: EventPointer = { id };
  const event = useEventByPointer(pointer);
  if (!event) return <p className={styles.loading}>{t("md_resolving")}</p>;
  return <NoteItem event={event} />;
}
