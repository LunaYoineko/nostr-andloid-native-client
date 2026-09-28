import { Link } from "react-router";
import { Virtuoso } from "react-virtuoso";
import { hrefForProfile } from "../../lib/content/labels";
import { displayName, pictureOf, useProfile } from "../../nostr/loaders";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { Avatar } from "../timeline/NoteItem";
import styles from "./FollowingList.module.css";

/**
 * フォロー中の一覧（ネイティブ UserListScreen）。プロフィールを置き換えて出し、「←」で戻る。
 * 行を押すとその人のプロフィール。プロフィールは表示された行の分だけまとめて取りに行く。
 */
export function FollowingList({ pubkeys, onBack }: { pubkeys: readonly string[]; onBack: () => void }) {
  return (
    <div className={styles.screen}>
      <ScreenHeader title="フォロー中" onBack={onBack} />
      <hr className={styles.divider} />
      {pubkeys.length === 0 ? (
        <p className={styles.empty}>見つかりませんでした</p>
      ) : (
        <Virtuoso
          data={pubkeys}
          computeItemKey={(_, pk) => pk}
          itemContent={(_, pk) => <UserRow pubkey={pk} />}
          style={{ flex: 1 }}
        />
      )}
    </div>
  );
}

/** ユーザー一覧の 1 行（アバター・名前・NIP-05。押すとプロフィール）。フォロワー一覧・リストタブでも使う */
export function UserRow({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const picture = pictureOf(profile);
  const name = displayName(profile, pubkey);
  const nip05 =
    typeof profile?.nip05 === "string" && profile.nip05.trim() !== "" ? profile.nip05.trim() : null;
  return (
    <Link to={hrefForProfile(pubkey)} className={styles.row}>
      <Avatar key={picture} url={picture} size="lg" seed={name} />
      <span className={styles.texts}>
        <span className={styles.name}>{name}</span>
        {nip05 && <span className={styles.nip05}>{nip05}</span>}
      </span>
    </Link>
  );
}
