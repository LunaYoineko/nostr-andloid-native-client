import { Link } from "react-router";
import { hrefForProfile } from "../../lib/content/labels";
import { displayName, pictureOf, useProfile } from "../../nostr/loaders";
import { BoltIcon } from "../../ui/icons";
import { Avatar } from "../timeline/NoteItem";
import type { ZapItem } from "../zap/zapTotals";
import styles from "./ZapRow.module.css";

/**
 * コメント付き Zap 1 件を返信風に出す（ネイティブの ThreadColumn.kt ZapRow）。
 * アバター（右下に ⚡）・名前・金額・コメント。アバターと名前はプロフィールへのリンク。
 */
export function ZapRow({ zap }: { zap: ZapItem & { sender: string } }) {
  const profile = useProfile(zap.sender);
  const picture = pictureOf(profile);
  const name = displayName(profile, zap.sender);
  const profileHref = hrefForProfile(zap.sender);
  return (
    <div className={styles.row}>
      <span className={styles.avatarBox}>
        {/* 名前と同じリンク先なので、読み上げ・タブ移動は名前の方だけにする */}
        <Link className={styles.avatarLink} to={profileHref} tabIndex={-1} aria-hidden="true">
          <Avatar key={picture} url={picture} size="md" seed={name} pubkey={zap.sender} />
        </Link>
        <BoltIcon className={styles.badge} title="Zap" />
      </span>
      <div className={styles.main}>
        <p className={styles.head}>
          <Link className={styles.name} to={profileHref}>
            {name}
          </Link>
          <span className={styles.sats}>{`${zap.sats} sats`}</span>
        </p>
        <p className={styles.comment}>{zap.comment}</p>
      </div>
    </div>
  );
}
