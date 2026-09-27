import { useState } from "react";
import { displayName, useProfile } from "../../nostr/loaders";
import { useSession } from "../../signer/session";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { useLayoutMode } from "../../ui/useLayoutMode";
import { useFollows } from "../deck/useFollows";
import { FollowingList } from "./FollowingList";
import { ProfileHeaderCard } from "./ProfileHeaderCard";
import { ProfilePostList } from "./ProfilePostList";
import styles from "./ProfileScreen.module.css";
import { type ProfileTab, ProfileTabs } from "./ProfileTabs";
import { useContactsOf } from "./useContactsOf";
import { useProfileFeed } from "./useProfileFeed";

const NO_PUBKEYS: readonly string[] = [];

/**
 * プロフィール画面（ネイティブ ProfileScreen）。
 * Compact = 上バー（← + 名前）→ ヘッダカード → 張り付くタブ → 投稿 を 1 つの縦スクロールで。
 * Expanded = 左 340px（上バー「プロフィール」+ ヘッダカード）｜右（タブ + 投稿）。
 * 「フォロー中」の件数を押すと一覧に置き換わる（← で戻る）。
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
  const mode = useLayoutMode();
  const me = useSession((s) => s.pubkey);
  const isMe = me === pubkey;
  const profile = useProfile(pubkey);
  const myFollows = useFollows(me);
  const theirFollows = useContactsOf(isMe ? null : pubkey);
  const followingList = (isMe ? myFollows : theirFollows) ?? NO_PUBKEYS;
  const following = myFollows?.includes(pubkey) ?? false;
  const followsMe = !isMe && me !== null && (theirFollows?.includes(me) ?? false);
  const { loading, posts, media } = useProfileFeed(pubkey, relayHints);
  const [tab, setTab] = useState<ProfileTab>("posts");
  const [view, setView] = useState<"profile" | "following">("profile");
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  if (view === "following") {
    return <FollowingList pubkeys={followingList} onBack={() => setView("profile")} />;
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
    />
  );
  const events = tab === "posts" ? posts : media;

  if (mode === "compact") {
    return (
      <div className={styles.screen} data-layout="compact">
        <ScreenHeader title={displayName(profile, pubkey)} onBack={onBack} />
        <div className={styles.scroll} ref={setScrollEl}>
          {header}
          <ProfileTabs tab={tab} onChange={setTab} sticky />
          {scrollEl && <ProfilePostList events={events} loading={loading} scrollParent={scrollEl} />}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen} data-layout="expanded">
      <aside className={styles.side} aria-label="プロフィール詳細">
        <ScreenHeader title="プロフィール" onBack={onBack} />
        <hr className={styles.divider} />
        {header}
      </aside>
      <div className={styles.main}>
        <ProfileTabs tab={tab} onChange={setTab} />
        <ProfilePostList events={events} loading={loading} />
      </div>
    </div>
  );
}
