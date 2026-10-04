import { type UIEvent, useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { displayName, useProfile } from "../../nostr/loaders";
import { useSession } from "../../signer/session";
import { PullToRefreshIndicator } from "../../ui/PullToRefreshIndicator";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { useLayoutMode } from "../../ui/useLayoutMode";
import { usePullToRefresh } from "../../ui/usePullToRefresh";
import { useFollows } from "../deck/useFollows";
import { FollowersList } from "./FollowersList";
import { FollowingList } from "./FollowingList";
import { useFollowers } from "./followers";
import { ListsTab } from "./ListsTab";
import { ProfileArticleList } from "./ProfileArticleList";
import { ProfileHeaderCard } from "./ProfileHeaderCard";
import { ProfilePostList } from "./ProfilePostList";
import styles from "./ProfileScreen.module.css";
import { type ProfileTab, ProfileTabs } from "./ProfileTabs";
import { usePinnedPosts } from "./pinnedPosts";
import { useContactsOf } from "./useContactsOf";
import { useProfileFeed } from "./useProfileFeed";

const NO_PUBKEYS: readonly string[] = [];

const PROFILE_TABS: readonly ProfileTab[] = ["posts", "media", "articles", "lists"];

function isProfileTab(v: unknown): v is ProfileTab {
  return typeof v === "string" && (PROFILE_TABS as readonly string[]).includes(v);
}

/**
 * [#401][#540] プロフィール → スレッド → 戻る でタブとスクロール位置を戻す（ネイティブ RestoreScroll 相当）。
 * ProfileOverlay はスレッドを開くと丸ごとアンマウントされる（AppShell の overlay は 1 枠）ので、
 * コンポーネントの state ではなく history のこのエントリの state（react-router の usr）に持たせる。
 * react-router の navigate は使わず window.history を直接叩く（URL は変えない・遷移中と競合しない）。
 */
function saveProfilePosition(tab: ProfileTab, scrollY: number): void {
  const current = window.history.state as { usr?: unknown } | null;
  const usr = typeof current?.usr === "object" && current.usr !== null ? current.usr : {};
  window.history.replaceState({ ...current, usr: { ...usr, profileTab: tab, profileScrollY: scrollY } }, "");
}

function readProfilePosition(): { tab: ProfileTab; scrollY: number } {
  const usr = (window.history.state as { usr?: unknown } | null)?.usr;
  const rec = typeof usr === "object" && usr !== null ? (usr as Record<string, unknown>) : {};
  return {
    tab: isProfileTab(rec.profileTab) ? rec.profileTab : "posts",
    scrollY: typeof rec.profileScrollY === "number" ? rec.profileScrollY : 0,
  };
}

/**
 * プロフィール画面（ネイティブ ProfileScreen）。
 * Compact/Rail = 上バー（← + 名前）→ ヘッダカード → 張り付くタブ → 投稿 を 1 つの縦スクロールで
 * （[#661] Rail は Compact と同じ 1 ペイン）。
 * Expanded = 左 340px（上バー「プロフィール」+ ヘッダカード）｜右（タブ + 投稿）。
 * 「フォロー中」の件数を押すと一覧に、「フォロワーを確認」を押すとフォロワー一覧に置き換わる（← で戻る）。
 */
export function ProfileScreen({
  pubkey,
  relayHints,
  onBack,
}: {
  pubkey: string;
  relayHints: readonly string[];
  onBack: () => void;
}) {
  const t = useT();
  const mode = useLayoutMode();
  const me = useSession((s) => s.pubkey);
  const isMe = me === pubkey;
  const profile = useProfile(pubkey);
  const myFollows = useFollows(me);
  const theirFollows = useContactsOf(isMe ? null : pubkey);
  const followingList = (isMe ? myFollows : theirFollows) ?? NO_PUBKEYS;
  const following = myFollows?.includes(pubkey) ?? false;
  const followsMe = !isMe && me !== null && (theirFollows?.includes(me) ?? false);
  const { loading, posts, media, articles, refresh } = useProfileFeed(pubkey, relayHints);
  const pinnedPosts = usePinnedPosts(pubkey);
  const followers = useFollowers(pubkey);
  const [initialPosition] = useState(readProfilePosition);
  const [tab, setTabState] = useState<ProfileTab>(initialPosition.tab);
  const [view, setView] = useState<"profile" | "following" | "followers">("profile");
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const scrollYRef = useRef(initialPosition.scrollY);
  const scrollFrame = useRef<number | null>(null);
  // 引っ張って更新（#601）。Compact/Rail の .scroll だけ（Expanded は Virtuoso が別にスクロールする）
  const {
    ref: pullRef,
    progress: pullProgress,
    refreshing: pullRefreshing,
  } = usePullToRefresh(mode !== "expanded" ? refresh : undefined);

  function setTab(t: ProfileTab) {
    setTabState(t);
    saveProfilePosition(t, scrollYRef.current);
  }

  // [#401][#540] Compact/Rail の縦スクロール（.scroll）の位置を復元・追従する。Expanded は Virtuoso が
  // 独自にスクロールするコンテナを持つため対象外（タブの復元だけ効く）。マウント直後に一度だけ。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 初回復元だけが目的（以後は自然なスクロールに任せる）
  useEffect(() => {
    if (scrollEl && initialPosition.scrollY > 0) scrollEl.scrollTop = initialPosition.scrollY;
  }, [scrollEl]);

  // 閉じた後に予約済みの保存が走ると、遷移先（別のプロフィール等）の履歴エントリへ書いてしまうので取り消す
  useEffect(
    () => () => {
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );

  function onScroll(e: UIEvent<HTMLDivElement>) {
    scrollYRef.current = e.currentTarget.scrollTop;
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      saveProfilePosition(tab, scrollYRef.current);
    });
  }

  if (view === "following") {
    return <FollowingList pubkeys={followingList} onBack={() => setView("profile")} />;
  }
  if (view === "followers") {
    return (
      <FollowersList state={followers} onLoadMore={followers.loadMore} onBack={() => setView("profile")} />
    );
  }

  const header = (
    <ProfileHeaderCard
      pubkey={pubkey}
      isMe={isMe}
      // RequireSession の内側なので実際は常にある
      me={me ?? ""}
      following={following}
      followsMe={followsMe}
      followingCount={followingList.length}
      onShowFollowing={() => setView("following")}
      onShowFollowers={() => {
        followers.start();
        setView("followers");
      }}
    />
  );
  const events = tab === "posts" ? posts : media;
  // 固定投稿は投稿タブの先頭だけ（ネイティブ pinnedForTab。メディア・記事タブには出さない）
  const pinned = tab === "posts" ? pinnedPosts : undefined;

  function tabPanel(scrollParent?: HTMLDivElement) {
    if (tab === "lists") return <ListsTab pubkey={pubkey} />;
    if (tab === "articles") {
      return <ProfileArticleList events={articles} loading={loading} scrollParent={scrollParent} />;
    }
    return <ProfilePostList events={events} loading={loading} pinned={pinned} scrollParent={scrollParent} />;
  }

  if (mode !== "expanded") {
    return (
      <div className={styles.screen} data-layout="compact">
        <ScreenHeader title={displayName(profile, pubkey)} onBack={onBack} />
        <div
          className={styles.scroll}
          ref={(el) => {
            setScrollEl(el);
            pullRef(el);
          }}
          onScroll={onScroll}
        >
          <PullToRefreshIndicator progress={pullProgress} refreshing={pullRefreshing} />
          {header}
          <ProfileTabs tab={tab} onChange={setTab} sticky />
          {tab === "lists" ? tabPanel() : scrollEl && tabPanel(scrollEl)}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen} data-layout="expanded">
      <aside className={styles.side} aria-label={t("web_profile_side_label")}>
        <ScreenHeader title={t("profile_section")} onBack={onBack} />
        <hr className={styles.divider} />
        {header}
      </aside>
      <div className={styles.main}>
        <ProfileTabs tab={tab} onChange={setTab} />
        {tabPanel()}
      </div>
    </div>
  );
}
