import type { AddressPointer } from "applesauce-core/helpers/pointers";
import { decode, naddrEncode } from "nostr-tools/nip19";
import type { NostrEvent } from "nostr-tools/pure";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useT } from "../../i18n";
import { hrefForEvent } from "../../lib/content/labels";
import { tokenizeNostrContent } from "../../lib/content/tokenize";
import { markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { useEventByAddress } from "../../nostr/loaders";
import styles from "./ArticleCard.module.css";

function tagValue(event: NostrEvent, name: string): string | null {
  const value = event.tags.find((t) => t[0] === name && typeof t[1] === "string")?.[1];
  return value?.trim() ? value.trim() : null;
}

/**
 * 記事カードの中身（ネイティブ ArticleEmbedCard.kt ArticleCardBody）。画像 72px・「記事」ラベル・
 * タイトル 2 行・概要（summary タグ、無ければ本文の最初の空でない行）2 行。プロフィールの記事タブでも使う。
 */
export function ArticleCardBody({ event }: { event: NostrEvent }) {
  const t = useT();
  const title = tagValue(event, "title") ?? t("article_untitled");
  const image = tagValue(event, "image");
  const excerpt = tagValue(event, "summary") ?? firstNonBlankLine(event.content);
  return (
    <div className={styles.body}>
      {image && <ArticleThumb url={image} />}
      <div className={styles.texts}>
        <p className={styles.label}>{t("article_title")}</p>
        <p className={styles.title}>{title}</p>
        {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
      </div>
    </div>
  );
}

function firstNonBlankLine(content: string): string | null {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return null;
}

function ArticleThumb({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(() => proxied(url, 144, 80));
  if (!src) return <span className={styles.image} aria-hidden="true" />;

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
      className={styles.image}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}

/**
 * naddr（kind:30023 記事）を addressLoader で解決し、OGP 風カードにする（ネイティブ ArticleEmbedCard）。
 * 解決中・解決できなければ淡色メッセージ（それでもカード自体は記事の URL へのリンク）。
 */
export function ArticleCard({ addr }: { addr: AddressPointer }) {
  const t = useT();
  const { event, failed } = useEventByAddress(addr);
  const href = useMemo(() => hrefForEvent(naddrEncode(addr)), [addr]);
  return (
    <Link className={styles.card} to={href}>
      {event && event.kind === 30023 ? (
        <ArticleCardBody event={event} />
      ) : (
        <p className={styles.pending}>{failed ? t("web_article_failed") : t("loading")}</p>
      )}
    </Link>
  );
}

/** 本文中の naddr（kind:30023）を出現順に最大 3 件抽出する。重複（同じ kind:pubkey:d）は除く */
function extractArticleAddrs(content: string): AddressPointer[] {
  const seen = new Set<string>();
  const out: AddressPointer[] = [];
  for (const token of tokenizeNostrContent(content)) {
    if (token.type !== "nostr" || !token.bech.startsWith("naddr1")) continue;
    let addr: AddressPointer | null = null;
    try {
      const decoded = decode(token.bech);
      if (decoded.type === "naddr") addr = decoded.data;
    } catch {
      // 読めない bech32
    }
    if (addr?.kind !== 30023) continue;
    const key = `${addr.kind}:${addr.pubkey}:${addr.identifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * [#534] ノート本文が参照する naddr(kind:30023 長文記事) を記事カードで展開する（ネイティブ NoteNaddrEmbeds）。
 * NoteItem の埋め込み（引用カード・メディア・リンクカード）の後に置く。
 */
export function ArticleCards({ content }: { content: string }) {
  const addrs = useMemo(() => extractArticleAddrs(content), [content]);
  if (addrs.length === 0) return null;
  return (
    <div className={styles.embeds}>
      {addrs.map((addr) => (
        <ArticleCard key={`${addr.kind}:${addr.pubkey}:${addr.identifier}`} addr={addr} />
      ))}
    </div>
  );
}
