import type { ReactNode } from "react";
import { Link } from "react-router";
import { hrefForProfile } from "../../lib/content/labels";
import { displayName, pictureOf, useProfile } from "../../nostr/loaders";
import { Avatar } from "../timeline/NoteItem";
import styles from "./ReactorRow.module.css";

/** 並べるアバターの上限（超えた分は +N） */
export const REACTOR_MAX_AVATARS = 12;

/**
 * 反応した人の 1 行（ネイティブの ReactorRow.kt）。先頭のアイコン → 件数 → アバター（最大 12 人、超えた分は +N）。
 * アバターはプロフィールへのリンク。
 */
export function ReactorRow({
  leading,
  label,
  people,
}: {
  leading: ReactNode;
  label: string;
  people: readonly string[];
}) {
  const extra = people.length - REACTOR_MAX_AVATARS;
  return (
    <div className={styles.row}>
      <span className={styles.lead}>{leading}</span>
      <span className={styles.label}>{label}</span>
      <span className={styles.people}>
        {people.slice(0, REACTOR_MAX_AVATARS).map((pubkey) => (
          <ReactorAvatar key={pubkey} pubkey={pubkey} />
        ))}
        {extra > 0 && <span className={styles.label}>+{extra}</span>}
      </span>
    </div>
  );
}

function ReactorAvatar({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const picture = pictureOf(profile);
  const name = displayName(profile, pubkey, "npub");
  return (
    <Link className={styles.avatarLink} to={hrefForProfile(pubkey)} aria-label={name} title={name}>
      <Avatar key={picture} url={picture} size="xs" seed={pubkey} />
    </Link>
  );
}
