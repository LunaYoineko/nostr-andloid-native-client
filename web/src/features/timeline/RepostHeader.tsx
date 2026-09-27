import { Link } from "react-router";
import { hrefForProfile } from "../../lib/content/labels";
import { displayName, pictureOf, useProfile } from "../../nostr/loaders";
import { RepeatIcon } from "../../ui/icons";
import { Avatar } from "./NoteItem";
import styles from "./RepostHeader.module.css";

/**
 * リポスト（kind:6/16）の 1 行「🔁 (アバター) 名前」（ネイティブの RepostHeader.kt）。
 * 「がリポスト」はアイコンが意味を担うので見せず、読み上げ用にだけ残す。
 */
export function RepostHeader({ reposter }: { reposter: string }) {
  const profile = useProfile(reposter);
  const picture = pictureOf(profile);
  return (
    <p className={styles.repostHeader}>
      <RepeatIcon className={styles.repostIcon} />
      <Avatar key={picture} url={picture} size="sm" seed={reposter} />
      <Link className={styles.repostName} to={hrefForProfile(reposter)}>
        {displayName(profile, reposter)}
      </Link>
      <span className="srOnly">がリポスト</span>
    </p>
  );
}
