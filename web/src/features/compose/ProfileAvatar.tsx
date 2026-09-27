import { useState } from "react";
import { markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { pictureOf, useProfile } from "../../nostr/loaders";
import styles from "./ProfileAvatar.module.css";

/** プロキシ幅（タイムラインのアバターと同じ URL にしてキャッシュを共有する） */
const PROXY_WIDTH = 96;

/** pubkey のアバター（投稿シートの自分・メンション候補・引用元）。画像が無ければ丸だけ */
export function ProfileAvatar({ pubkey, size }: { pubkey: string; size: 22 | 28 | 32 }) {
  const picture = pictureOf(useProfile(pubkey));
  return <AvatarImage key={picture} url={picture} size={size} />;
}

/** #454 の Avatar と同じ取り方: プロキシが読めなければ元 URL（https のみ）で 1 度だけ取り直す */
function AvatarImage({ url, size }: { url: string | undefined; size: 22 | 28 | 32 }) {
  const [src, setSrc] = useState(() =>
    url && /^https?:\/\//i.test(url.trim()) ? proxied(url, PROXY_WIDTH) : null,
  );
  if (!src) return <span className={styles.avatar} data-size={size} aria-hidden="true" />;

  function onError() {
    const origin = originOf(src);
    if (origin) {
      markProxyBlocked(origin);
      setSrc(/^https:\/\//i.test(origin) ? origin : null);
    } else {
      setSrc(null);
    }
  }

  return (
    <img
      className={styles.avatar}
      data-size={size}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}
