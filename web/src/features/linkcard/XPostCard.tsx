import { type MouseEvent, useEffect, useState } from "react";
import { useT } from "../../i18n";
import { useLocale } from "../../i18n/locale";
import { avatarInitial, avatarShade } from "../../lib/avatar";
import { proxied } from "../../lib/imageProxy";
import { ogpLoader } from "./ogpLoader";
import styles from "./XPostCard.module.css";
import { isProfileImage, profileUrl, type XPost } from "./xPost";
import { type XLang, xPostDateLoader } from "./xPostLoader";

/** プロキシ幅（アイコンは表示 36px の 2.5 倍強、写真はカラム幅の 1.5 倍程度） */
const AVATAR_PROXY_WIDTH = 96;
const PHOTO_PROXY_WIDTH = 640;

/** X のロゴ（公式の 24x24 のパス）。装飾なので読み上げない */
function XLogo() {
  return (
    <svg className={styles.logo} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

/**
 * X の投稿カードの表示（#744。ネイティブ LinkEmbeds.kt の XPostEmbed と同じ構成）。
 * 1 行目: アイコン・太字の名前・右上に X のロゴ / 2 行目: `@ハンドル · 日付` / 本文（4 行まで。カードのタップで
 * 全文と折りたたみ）/ 写真（4:3 で 1 枚）/ 「X で開く」。取れない部分（日付・写真）は出さず、アイコンは頭文字の丸。
 * 画像は ogpImages が false なら読まない。X の文字は全て文字として描く（HTML として解釈しない）。
 */
export function XPostCard({
  post,
  date = null,
  avatar = null,
  ogpImages = true,
}: {
  post: XPost;
  /** 投稿日（oEmbed の表示文字列）。無ければ出さない */
  date?: string | null;
  /** アイコンの URL。無ければ頭文字の丸 */
  avatar?: string | null;
  ogpImages?: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const displayName = post.name ?? post.handle;
  const avatarSrc = ogpImages && avatar && !avatarFailed ? proxied(avatar, AVATAR_PROXY_WIDTH) : null;
  const photoSrc = ogpImages && post.image && !photoFailed ? proxied(post.image, PHOTO_PROXY_WIDTH) : null;

  // リンク（「X で開く」）のタップでは開閉しない
  const onCardClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as Element).closest("a")) return;
    setExpanded((v) => !v);
  };
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: キーボードでは本文の button（aria-expanded）が開閉を受ける（click はカードへ伝わり 1 回だけ切り替わる）
    <article className={styles.card} data-no-open onClick={onCardClick}>
      <div className={styles.head}>
        {avatarSrc ? (
          <img
            className={styles.avatar}
            src={avatarSrc}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <span
            className={`${styles.avatar} ${styles.initial}`}
            style={{ background: avatarShade(displayName) }}
            aria-hidden="true"
          >
            {avatarInitial(displayName)}
          </span>
        )}
        <div className={styles.who}>
          <span className={styles.name}>{displayName}</span>
          <span className={styles.meta}>{[`@${post.handle}`, date].filter(Boolean).join(" · ")}</span>
        </div>
        <XLogo />
      </div>
      <button type="button" className={styles.textButton} aria-expanded={expanded}>
        <span className={`${styles.text} ${expanded ? styles.expanded : ""}`}>{post.text}</span>
      </button>
      {photoSrc && (
        <img
          className={styles.photo}
          src={photoSrc}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setPhotoFailed(true)}
        />
      )}
      <a className={styles.open} href={post.url} target="_blank" rel="noopener noreferrer nofollow ugc">
        {t("web_x_post_open")}
      </a>
    </article>
  );
}

/** 表示言語から oEmbed の言語（ja 系 → ja、それ以外 → en） */
function useXLang(): XLang {
  return useLocale((s) => s.resolved) === "en" ? "en" : "ja";
}

/**
 * OGP から作れた投稿に、日付（oEmbed）とアイコン（プロフィールページの OGP）を足して XPostCard を描く。
 * どちらも取れるまで・取れなければ出さない。アイコンは画像なので ogpImages が false なら取りに行かない。
 */
export function XPostEmbed({ post, ogpImages }: { post: XPost; ogpImages: boolean }) {
  const lang = useXLang();
  const [date, setDate] = useState<{ key: string; value: string | null } | null>(() => {
    const known = xPostDateLoader.peek(post.url, lang);
    return known === undefined ? null : { key: `${lang}:${post.url}`, value: known };
  });
  const dateKey = `${lang}:${post.url}`;
  useEffect(() => {
    let alive = true;
    void xPostDateLoader.load(post.url, lang).then((value) => {
      if (alive) setDate({ key: dateKey, value });
    });
    return () => {
      alive = false;
    };
  }, [post.url, lang, dateKey]);

  const needAvatar = ogpImages && post.avatar === null;
  const [fetchedAvatar, setFetchedAvatar] = useState<{ handle: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!needAvatar) return;
    let alive = true;
    void ogpLoader.load(profileUrl(post.handle)).then((ogp) => {
      if (alive)
        setFetchedAvatar({
          handle: post.handle,
          url: isProfileImage(ogp?.image) ? (ogp?.image ?? null) : null,
        });
    });
    return () => {
      alive = false;
    };
  }, [needAvatar, post.handle]);

  const avatar = post.avatar ?? (fetchedAvatar?.handle === post.handle ? fetchedAvatar.url : null);
  return (
    <XPostCard
      post={post}
      date={date?.key === dateKey ? date.value : null}
      avatar={avatar}
      ogpImages={ogpImages}
    />
  );
}
