import { use$ } from "applesauce-react/hooks/use-$";
import { npubEncode } from "nostr-tools/nip19";
import type { NostrEvent } from "nostr-tools/pure";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { displayName, pictureOf, useProfile } from "../../nostr/loaders";
import { eventStore } from "../../nostr/store";
import { ContentCopyIcon } from "../../ui/icons";
import { Lightbox } from "../media/Lightbox";
import { RichText } from "../timeline/NoteContent";
import { Avatar } from "../timeline/NoteItem";
import { ZapDialog } from "../zap/ZapDialog";
import { parseAbout } from "./about";
import { FollowButton } from "./FollowButton";
import { Nip05Handle } from "./Nip05Handle";
import styles from "./ProfileHeaderCard.module.css";
import { ProfileMenu } from "./ProfileMenu";
import { ProfileRelays } from "./ProfileRelays";

/** 「コピーしました」等を出しておく時間 */
const STATUS_MS = 1_500;
/** フォロー失敗の案内を出しておく時間 */
const ERROR_MS = 4_000;

const WEB_URL = /^https?:\/\//i;

/** kind:0 の値のうち、空でない文字列だけ（前後の空白は落とす） */
function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * kind:0 に書かれたままの website。applesauce の解析（useProfile）はスキームの無い値に https:// を足すので、
 * 元の JSON から読む（スキームの無い値は文字のまま出す = ネイティブと同じ）。
 */
function rawWebsite(profileEvent: NostrEvent | undefined): string | null {
  if (!profileEvent) return null;
  try {
    const content: unknown = JSON.parse(profileEvent.content);
    return typeof content === "object" && content !== null
      ? textOf((content as Record<string, unknown>).website)
      : null;
  } catch {
    return null;
  }
}

/** 一定時間で消える 1 行の案内 */
function useTimedMessage(durationMs: number): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = useCallback(
    (next: string) => {
      setMessage(next);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs],
  );
  return [message, show];
}

/**
 * プロフィールのヘッダ（ネイティブ ProfileHeaderCard）。バナー・アバター・⋯・フォロー / 編集、名前・NIP-05・npub・
 * フォロー中の件数・自己紹介・lud16・website・使用リレー。バナーとアバターは押すと原寸で開く。
 * 他人の lud16 は押すとプロフィール Zap。
 */
export function ProfileHeaderCard({
  pubkey,
  isMe,
  me,
  following,
  followsMe,
  followingCount,
  onShowFollowing,
}: {
  pubkey: string;
  isMe: boolean;
  me: string;
  following: boolean;
  followsMe: boolean;
  followingCount: number;
  onShowFollowing: () => void;
}) {
  const navigate = useNavigate();
  const profile = useProfile(pubkey);
  const profileEvent = use$(() => eventStore.replaceable(0, pubkey), [pubkey]);
  const picture = pictureOf(profile);
  const name = displayName(profile, pubkey);
  const zoomablePicture = picture && WEB_URL.test(picture.trim()) ? picture.trim() : null;
  const banner = textOf(profile?.banner);
  const nip05 = textOf(profile?.nip05);
  const about = textOf(profile?.about);
  const lud16 = textOf(profile?.lud16);
  const website = useMemo(() => rawWebsite(profileEvent), [profileEvent]);
  const npub = useMemo(() => npubEncode(pubkey), [pubkey]);
  // kind:0 のイベントが手元に来るまでは about を出さない（カスタム絵文字は kind:0 のタグから引く）
  const aboutRoot = useMemo(
    () => (profileEvent && about ? parseAbout(profileEvent, about) : null),
    [profileEvent, about],
  );

  const [status, showStatus] = useTimedMessage(STATUS_MS);
  const [error, showError] = useTimedMessage(ERROR_MS);
  const [zoom, setZoom] = useState<string | null>(null);
  const [zapping, setZapping] = useState(false);

  async function copyNpub() {
    try {
      await navigator.clipboard.writeText(npub);
    } catch {
      showStatus("コピーできませんでした");
      return;
    }
    showStatus("npub をコピーしました");
  }

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        {banner && WEB_URL.test(banner) ? (
          <Banner key={banner} url={banner} onOpen={() => setZoom(banner)} />
        ) : (
          <div className={styles.banner} />
        )}
        <div className={styles.band} />
        {zoomablePicture ? (
          <button
            type="button"
            className={styles.ring}
            aria-label="画像を表示"
            onClick={() => setZoom(zoomablePicture)}
          >
            <Avatar key={picture} url={picture} size="xxl" seed={name} />
          </button>
        ) : (
          <div className={styles.ring}>
            <Avatar key={picture} url={picture} size="xxl" seed={name} />
          </div>
        )}
        <div className={styles.actions}>
          <ProfileMenu pubkey={pubkey} onCopied={showStatus} />
          {isMe ? (
            <button
              type="button"
              className={`${styles.pill} ${styles.ghost}`}
              onClick={() => navigate("/settings/profile-edit", { replace: true })}
            >
              編集
            </button>
          ) : (
            <FollowButton me={me} target={pubkey} following={following} onError={showError} />
          )}
        </div>
      </div>
      <div className={styles.text}>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.nameRow}>
          <h2 className={styles.name}>{name}</h2>
          {followsMe && <span className={styles.badge}>フォローされています</span>}
        </div>
        {nip05 && (
          <div className={styles.line}>
            <Nip05Handle pubkey={pubkey} nip05={nip05} size="sub" />
          </div>
        )}
        <div className={`${styles.line} ${styles.npubRow}`}>
          <span className={styles.npub} title={npub}>{`${npub.slice(0, 20)}…${npub.slice(-6)}`}</span>
          <button
            type="button"
            className={`${styles.circle} ${styles.copy}`}
            aria-label="npub をコピー"
            onClick={copyNpub}
          >
            <ContentCopyIcon className={styles.icon} />
          </button>
        </div>
        {status && (
          <p role="status" className={styles.status}>
            {status}
          </p>
        )}
        <div className={styles.counts}>
          <button type="button" className={styles.count} onClick={onShowFollowing}>
            <span className={styles.countNum}>{followingCount}</span>
            <span className={styles.hint}>フォロー中</span>
          </button>
        </div>
        {aboutRoot && (
          <div className={styles.about}>
            <RichText root={aboutRoot} size="sub" />
          </div>
        )}
        {lud16 &&
          (isMe ? (
            <p className={styles.lud16}>{`⚡ ${lud16}`}</p>
          ) : (
            // 他人の lud16 は押すとプロフィール Zap（e タグ無し。ネイティブ ProfileZapSheet）
            <button type="button" className={styles.lud16} onClick={() => setZapping(true)}>
              {`⚡ ${lud16}`}
            </button>
          ))}
        {website &&
          (WEB_URL.test(website) ? (
            <a
              className={styles.website}
              href={website}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
            >
              {website}
            </a>
          ) : (
            <span className={styles.website}>{website}</span>
          ))}
        <ProfileRelays pubkey={pubkey} />
      </div>
      {zoom && <Lightbox items={[{ url: zoom }]} index={0} onClose={() => setZoom(null)} />}
      {zapping && lud16 && (
        <ZapDialog recipient={pubkey} recipientName={name} lud16={lud16} onClose={() => setZapping(false)} />
      )}
    </div>
  );
}

/**
 * バナー画像。プロキシが読めなければ元 URL（https のみ）で 1 度だけ取り直し、それも読めなければ帯だけにする
 * （Avatar と同じ）。url が変わったら呼び出し側の key で作り直す。
 */
function Banner({ url, onOpen }: { url: string; onOpen: () => void }) {
  const [src, setSrc] = useState<string | null>(() => proxied(url, 900, 80, true));
  if (!src) return <div className={styles.banner} />;

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
    <button type="button" className={styles.banner} aria-label="画像を表示" onClick={onOpen}>
      <img src={src} alt="" decoding="async" referrerPolicy="no-referrer" onError={onError} />
    </button>
  );
}
