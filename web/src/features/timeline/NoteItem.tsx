import { getSeenRelays } from "applesauce-core/helpers/relays";
import type { NostrEvent } from "nostr-tools/pure";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { avatarInitial, avatarShade } from "../../lib/avatar";
import { hrefForEvent, hrefForProfile } from "../../lib/content/labels";
import { isBlankContent, parseNoteContent, withoutLinks, withoutMention } from "../../lib/content/parse";
import { clientNameOf, contentWarningOf, quotePointerOf } from "../../lib/content/tags";
import { markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { extractMedia } from "../../lib/media";
import { relativeTime } from "../../lib/time";
import { displayName, pictureOf, useEventByPointer, useProfile, useRepostedEvent } from "../../nostr/loaders";
import { NoteActionButtons } from "../actions/NoteActionButtons";
import { ArticleCards } from "../article/ArticleCard";
import { NoteFooter } from "../compose/NoteFooter";
import { LinkCards } from "../linkcard/LinkCard";
import { useLinkCards } from "../linkcard/useLinkCards";
import { NoteMedia } from "../media/NoteMedia";
import { CollapsibleContent } from "./CollapsibleContent";
import { ContentWarning } from "./ContentWarning";
import { NoteContent } from "./NoteContent";
import styles from "./NoteItem.module.css";
import { QuoteCard } from "./QuoteCard";
import { ReplyContext } from "./ReplyContext";
import { RepostHeader } from "./RepostHeader";
import { useNow } from "./useNow";
import { useOpenOnClick } from "./useOpenOnClick";

/** アバターのプロキシ幅（表示 38px の約 2.5 倍。リポストヘッダの 16px でも同じ URL を使いキャッシュを共有する） */
const AVATAR_PROXY_WIDTH = 96;

/**
 * リポスト元を待つ時間。過ぎても取れなければ行ごと隠す
 * （ネイティブは未取得の間は行を出さない。待ち時間の値はネイティブに無い）
 */
const REPOST_WAIT_MS = 8_000;

/** 待ちきれずに隠したリポストの id（仮想リストで作り直されたとき、また「読み込み中…」から始めない） */
const gaveUpReposts = new Set<string>();

/**
 * タイムラインの 1 件（ネイティブの NoteItem.kt）。返信先の 1 行・アバター・表示名・NIP-05・相対時刻・本文・引用カード。
 * kind:6/16 は「🔁 (アバター) 名前」の行を付けて元投稿を出す。
 * openable（既定 true）なら全体のクリックと時刻のリンクでスレッドを開く（スレッドの行では false）。
 * embedded（既定 false）は通知の行の本体用: 下線と返信先の 1 行を出さない（kind 1 / 1111 のみ）。
 */
export const NoteItem = memo(function NoteItem({
  event,
  openable = true,
  embedded = false,
}: {
  event: NostrEvent;
  openable?: boolean;
  embedded?: boolean;
}) {
  if (event.kind === 6 || event.kind === 16) return <RepostItem repost={event} openable={openable} />;
  return <PostItem event={event} openable={openable} embedded={embedded} />;
});

function PostItem({
  event,
  openable,
  embedded,
}: {
  event: NostrEvent;
  openable: boolean;
  embedded: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const href = openable ? threadHrefOf(event) : null;
  useOpenOnClick(ref, href);
  const base = embedded ? styles.embedded : styles.note;
  return (
    <article ref={ref} className={href ? `${base} ${styles.openable}` : base}>
      <NoteBody event={event} threadHref={href} embedded={embedded} />
    </article>
  );
}

function RepostItem({ repost, openable }: { repost: NostrEvent; openable: boolean }) {
  const original = useRepostedEvent(repost);
  const ref = useRef<HTMLElement>(null);
  // 開く先は元投稿（未解決の間は開かない）
  const href = openable && original ? threadHrefOf(original) : null;
  useOpenOnClick(ref, href);
  const [gaveUp, setGaveUp] = useState(() => gaveUpReposts.has(repost.id));
  const waiting = original === undefined && !gaveUp;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      gaveUpReposts.add(repost.id);
      setGaveUp(true);
    }, REPOST_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting, repost.id]);
  // 取れないまま待ち時間が過ぎたら隠す（仮想リストは高さ 0 の行を扱えないので 1px の空行）。後から届けば出す
  if (!original && gaveUp) return <div className={styles.hiddenRow} aria-hidden="true" />;
  return (
    <article ref={ref} className={href ? `${styles.note} ${styles.openable}` : styles.note}>
      <RepostHeader reposter={repost.pubkey} />
      {original ? (
        <NoteBody event={original} threadHref={href} />
      ) : (
        <p className={styles.missing}>元の投稿を読み込み中…</p>
      )}
    </article>
  );
}

/** スレッドを開くリンク先。受け取ったリレーを 2 件までヒントに付ける */
function threadHrefOf(target: NostrEvent): string {
  const seen = [...(getSeenRelays(target) ?? [])].slice(0, 2);
  return hrefForEvent(
    seen.length > 0
      ? { id: target.id, author: target.pubkey, relays: seen }
      : { id: target.id, author: target.pubkey },
  );
}

function NoteBody({
  event,
  threadHref,
  embedded = false,
}: {
  event: NostrEvent;
  threadHref: string | null;
  embedded?: boolean;
}) {
  const profile = useProfile(event.pubkey);
  const picture = pictureOf(profile);
  const name = displayName(profile, event.pubkey);
  const nip05 =
    typeof profile?.nip05 === "string" && profile.nip05.trim() !== "" ? profile.nip05.trim() : null;
  const profileHref = hrefForProfile(event.pubkey);

  // CW の開封はこの表示の間だけ覚える
  const [revealed, setRevealed] = useState(false);
  const warning = contentWarningOf(event);

  // 本文中の参照は、引用元が取れてカードに出せたときだけ本文から消す（取れない間は ↗ のリンクのまま）
  const quote = useMemo(() => quotePointerOf(event), [event]);
  const quoted = useEventByPointer(quote?.pointer ?? null);
  const hideMention = quoted ? (quote?.encoded ?? null) : null;
  // リンクも同じく、カードに出せたものだけ本文から消す（取得中・取れなかったものはリンクのまま）
  const linkCards = useLinkCards(event, warning === null || revealed);
  const hasText = useMemo(
    () =>
      !isBlankContent(withoutLinks(withoutMention(parseNoteContent(event), hideMention), linkCards.carded)),
    [event, hideMention, linkCards.carded],
  );
  const media = extractMedia(event);
  const hasMedia = media.images.length + media.videos.length + media.youtube.length > 0;

  return (
    <>
      {!embedded && <ReplyContext event={event} />}
      <div className={styles.row}>
        {/* 名前と同じリンク先なので、読み上げ・タブ移動は名前の方だけにする */}
        <Link className={styles.avatarLink} to={profileHref} tabIndex={-1} aria-hidden="true">
          <Avatar key={picture} url={picture} size="md" seed={name} />
        </Link>
        <div className={styles.main}>
          <div className={styles.meta}>
            <span className={styles.author}>
              <Link className={styles.name} to={profileHref}>
                {name}
              </Link>
              {nip05 && <span className={styles.handle}>{nip05}</span>}
            </span>
            {threadHref ? (
              <Link to={threadHref} className={styles.timeLink}>
                <RelativeTime createdAt={event.created_at} client={clientNameOf(event)} />
              </Link>
            ) : (
              <RelativeTime createdAt={event.created_at} client={clientNameOf(event)} />
            )}
          </div>
          {warning !== null && !revealed ? (
            <ContentWarning reason={warning} onReveal={() => setRevealed(true)} />
          ) : (
            <>
              {hasText && (
                <CollapsibleContent event={event}>
                  <NoteContent event={event} hideMention={hideMention} hideLinks={linkCards.carded} />
                </CollapsibleContent>
              )}
              {quote && <QuoteCard pointer={quote.pointer} encoded={quote.encoded} />}
              {hasMedia && <NoteMedia media={media} />}
              <LinkCards cards={linkCards.cards} />
              <ArticleCards content={event.content} />
            </>
          )}
          <NoteFooter event={event}>
            <NoteActionButtons event={event} />
          </NoteFooter>
        </div>
      </div>
    </>
  );
}

/**
 * 相対時刻（30 秒ごとに進む）。title に日時と、client タグがあれば「… · <client> から投稿」を出す
 * （行には出さない = ネイティブと同じ）。
 */
function RelativeTime({ createdAt, client }: { createdAt: number; client: string | null }) {
  const now = useNow();
  const date = new Date(createdAt * 1000);
  // created_at は任意の数値なので、Date の範囲外なら属性を付けない（toISOString が例外を投げる）
  const valid = Number.isFinite(date.getTime());
  const title = valid ? `${date.toLocaleString()}${client ? ` · ${client} から投稿` : ""}` : undefined;
  return (
    <time className={styles.time} dateTime={valid ? date.toISOString() : undefined} title={title}>
      {relativeTime(createdAt, now)}
    </time>
  );
}

/**
 * md = 38px（タイムライン）、sm = 16px（リポストヘッダ）、xs = 20px（リアクションした人の列）、
 * lg = 40px（ユーザー一覧）、xl = 60px（PROFILE カラムの上部カード）、xxl = 72px（プロフィール）
 */
export type AvatarSize = "md" | "sm" | "xs" | "lg" | "xl" | "xxl";

/** プロキシ幅。xxl だけネイティブの Avatar と同じ 256 */
const AVATAR_PROXY: Record<AvatarSize, number> = {
  md: AVATAR_PROXY_WIDTH,
  sm: AVATAR_PROXY_WIDTH,
  xs: AVATAR_PROXY_WIDTH,
  lg: AVATAR_PROXY_WIDTH,
  xl: AVATAR_PROXY_WIDTH,
  xxl: 256,
};

const AVATAR_CLASS: Record<AvatarSize, string> = {
  md: styles.avatar,
  sm: styles.avatarSm,
  xs: styles.avatarXs,
  lg: styles.avatarLg,
  xl: styles.avatarXl,
  xxl: styles.avatarXxl,
};

/** wsrv.nl を通した画像 URL。http(s) 以外は出さない */
function avatarSrc(url: string | undefined, width: number): string | null {
  if (!url || !/^https?:\/\//i.test(url.trim())) return null;
  return proxied(url, width);
}

/**
 * アバター。プロキシが読めなければ元 URL（https のみ）で 1 度だけ取り直し、そのホストを拒否として学習する。
 * 画像が無い・読めないときは seed（ネイティブと同じく名前か pubkey）の頭文字をグレーの丸に出す。
 * url が変わったら呼び出し側の key で作り直す。
 */
export function Avatar({ url, size, seed }: { url: string | undefined; size: AvatarSize; seed: string }) {
  const [src, setSrc] = useState(() => avatarSrc(url, AVATAR_PROXY[size]));
  const className = AVATAR_CLASS[size];
  if (!src) {
    return (
      <span
        className={`${className} ${styles.initial}`}
        style={{ background: avatarShade(seed) }}
        aria-hidden="true"
      >
        {avatarInitial(seed)}
      </span>
    );
  }

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
      className={className}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}
