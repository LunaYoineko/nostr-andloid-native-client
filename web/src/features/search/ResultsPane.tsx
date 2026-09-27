import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Virtuoso } from "react-virtuoso";
import { buildSearchColumn } from "../../lib/columns";
import { hrefForProfile, oneLine } from "../../lib/content/labels";
import { shortNpub } from "../../lib/npub";
import { unixNow } from "../../lib/time";
import { useDeck } from "../../store/deck";
import { useColumnFeed } from "../deck/useColumnFeed";
import { Avatar, NoteItem } from "../timeline/NoteItem";
import styles from "./ResultsPane.module.css";
import { SEARCH_ROWS_TOTAL, searchSpecOf, searchSummary, tokensToFilter, userQueryOf } from "./searchTokens";
import { type UserHit, useUserSearch } from "./searchUsers";

type Tab = "posts" | "users";

/**
 * 検索結果（ネイティブ ResultsPane）。見出し行（← 履歴・検索: 条件・Deckに追加）→ 投稿 / ユーザーの切替 → 一覧。
 * 実行し直すたびに呼び出し側の key で作り直す（REQ の張り直しと「投稿」への戻り）。
 */
export function ResultsPane({ tokens, onBack }: { tokens: readonly string[]; onBack?: () => void }) {
  // 条件の中身が変わったときだけ作り直す（語に空白・改行は入らない）
  const key = tokens.join("\n");
  const spec = useMemo(() => searchSpecOf(key === "" ? [] : key.split("\n")), [key]);
  const { events, loading } = useColumnFeed(spec);
  const posts = useMemo(() => events.slice(0, SEARCH_ROWS_TOTAL), [events]);
  const { users, loading: usersLoading } = useUserSearch(userQueryOf(tokens));
  const [tab, setTab] = useState<Tab>("posts");

  function addToDeck() {
    const s = useDeck.getState();
    const { words, hashtags } = tokensToFilter(tokens);
    // デッキへの移動は AppShell（宛先の外で jump したらデッキへ出す）が行う
    s.addColumn(buildSearchColumn(words, hashtags, new Set(s.columns.map((c) => c.id)), unixNow()));
  }

  return (
    <div className={styles.results}>
      <div className={styles.head}>
        {onBack && (
          <button type="button" className={styles.textButton} onClick={onBack}>
            ← 履歴
          </button>
        )}
        <p className={styles.summary}>{searchSummary(tokens)}</p>
        <button type="button" className={styles.ghost} onClick={addToDeck}>
          Deckに追加
        </button>
      </div>
      <div role="tablist" aria-label="検索結果の種類" className={styles.tabs}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "posts"}
          className={styles.tab}
          onClick={() => setTab("posts")}
        >
          投稿{posts.length > 0 ? ` ${posts.length}` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "users"}
          className={styles.tab}
          onClick={() => setTab("users")}
        >
          ユーザー{users.length > 0 ? ` ${users.length}` : ""}
        </button>
      </div>
      <hr className={styles.divider} />
      <div className={styles.body} role="tabpanel">
        {tab === "posts" ? (
          posts.length === 0 ? (
            <StateView loading={loading} emptyText="検索結果がありません" />
          ) : (
            <Virtuoso
              data={posts}
              computeItemKey={(_, e) => e.id}
              itemContent={(_, e) => <NoteItem event={e} />}
              style={{ height: "100%" }}
            />
          )
        ) : users.length === 0 ? (
          <StateView loading={usersLoading} emptyText="条件に合うユーザーがいません。" />
        ) : (
          <Virtuoso
            data={users}
            computeItemKey={(_, h) => h.pubkey}
            itemContent={(_, h) => <UserRow hit={h} />}
            style={{ height: "100%" }}
          />
        )}
      </div>
    </div>
  );
}

/** 読み込み中 / 空（ネイティブ ColumnStateView） */
function StateView({ loading, emptyText }: { loading: boolean; emptyText: string }) {
  if (loading) {
    return (
      <div className={styles.state} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        <span>読み込み中…</span>
      </div>
    );
  }
  return <p className={styles.state}>{emptyText}</p>;
}

/** ユーザーの 1 行（ネイティブ SearchUserRow）。押すとプロフィール */
function UserRow({ hit }: { hit: UserHit }) {
  return (
    <Link to={hrefForProfile(hit.pubkey)} className={styles.user}>
      <Avatar key={hit.picture} url={hit.picture} size="lg" />
      <span className={styles.userTexts}>
        <span className={styles.userName}>{hit.name || shortNpub(hit.pubkey)}</span>
        {hit.handle && <span className={styles.userHandle}>{hit.handle}</span>}
        {hit.about && <span className={styles.userAbout}>{oneLine(hit.about)}</span>}
      </span>
    </Link>
  );
}
