import { useState } from "react";
import { markProxyBlocked, originOf, proxied } from "../lib/imageProxy";
import { pictureOf, useProfile } from "../nostr/loaders";
import { useSession } from "../signer/session";
import styles from "./AccountAvatar.module.css";

/** プロキシに頼む幅（40px の表示を高密度画面でも粗くしない） */
const PROXY_WIDTH = 96;

function avatarSrc(url: string | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url.trim())) return null;
  return proxied(url, PROXY_WIDTH);
}

/**
 * ログイン中のアカウントのアバター（下部ナビ 24px / レール 40px の「設定」）。
 * 名前はボタン側が持つので alt は空。画像が無い・読めないときは丸だけ。
 */
export function AccountAvatar({ size }: { size: 24 | 40 }) {
  const me = useSession((s) => s.pubkey);
  const picture = pictureOf(useProfile(me ?? undefined));
  // 画像が変わったら読み込み失敗の状態ごと作り直す
  return <AvatarImage key={picture} url={picture} size={size} />;
}

function AvatarImage({ url, size }: { url: string | undefined; size: 24 | 40 }) {
  const [src, setSrc] = useState(() => avatarSrc(url));
  const className = size === 24 ? styles.small : styles.large;
  if (!src) return <span className={`${styles.avatar} ${className}`} aria-hidden="true" />;

  // 1 回目の失敗はプロキシを諦めて元 URL（https のみ）、2 回目以降は丸だけ
  function onError() {
    const origin = originOf(src);
    if (origin && /^https:\/\//i.test(origin)) {
      markProxyBlocked(origin);
      setSrc(origin);
    } else {
      setSrc(null);
    }
  }

  return (
    <img
      className={`${styles.avatar} ${className}`}
      src={src}
      alt=""
      decoding="async"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}
