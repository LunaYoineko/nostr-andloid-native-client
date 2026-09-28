import { isAddressPointer } from "applesauce-core/helpers/pointers";
import { decode } from "nostr-tools/nip19";
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import { parseEventRef } from "../../app/overlays/refs";
import { hrefForEvent, hrefForProfile } from "../../lib/content/labels";
import { markProxyBlocked, originOf, proxied } from "../../lib/imageProxy";
import { QuoteCard } from "../timeline/QuoteCard";
import { ArticleCard } from "./ArticleCard";
import styles from "./ArticleMarkdown.module.css";
import { type MdBlock, type MdInline, parseInline, parseMarkdownBlocks } from "./markdown";

/**
 * [#534] 記事本文（Markdown）を React 要素にする（ネイティブ Markdown.kt の RenderBlock / InlineText の移植）。
 * HTML 文字列は一切作らない（dangerouslySetInnerHTML は使わない）。画像は imageProxy 経由、
 * リンクは http / https / nostr だけ（markdown.ts の parseInline がそれ以外を地の文字に落としている）。
 */
export function ArticleMarkdown({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);
  return <div className={styles.markdown}>{renderBlocks(blocks)}</div>;
}

type ListItemBlock = Extract<MdBlock, { type: "listItem" }>;

function renderBlocks(blocks: readonly MdBlock[]): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === "listItem") {
      const items: ListItemBlock[] = [];
      while (i < blocks.length) {
        const next = blocks[i];
        if (next.type !== "listItem" || next.ordered !== block.ordered) break;
        items.push(next);
        i++;
      }
      const Tag = block.ordered ? "ol" : "ul";
      out.push(
        <Tag key={`list-${i}`} className={styles.list}>
          {items.map((item, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: リスト項目は並び替わらない
            <li key={idx}>{renderInline(item.text)}</li>
          ))}
        </Tag>,
      );
      continue;
    }
    out.push(renderBlock(block, i));
    i++;
  }
  return out;
}

function renderBlock(block: MdBlock, key: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const level = Math.min(block.level, 4);
      const Tag = `h${Math.min(block.level, 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag key={key} className={styles[`h${level}`]}>
          {renderInline(block.text)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={key} className={styles.paragraph}>
          {renderInline(block.text)}
        </p>
      );
    case "quote":
      return (
        <blockquote key={key} className={styles.quote}>
          {renderInline(block.text)}
        </blockquote>
      );
    case "code":
      return (
        <pre key={key} className={styles.code}>
          <code>{block.text}</code>
        </pre>
      );
    case "image":
      return <ArticleImage key={key} url={block.url} alt={block.alt} />;
    case "rule":
      return <hr key={key} className={styles.rule} />;
    case "noteRef": {
      const pointer = parseEventRef(block.encoded);
      if (!pointer || isAddressPointer(pointer)) return null;
      return (
        <div key={key} className={styles.embed}>
          <QuoteCard pointer={pointer} encoded={block.encoded} />
        </div>
      );
    }
    case "addrRef": {
      const pointer = parseEventRef(block.encoded);
      if (!pointer || !isAddressPointer(pointer)) return null;
      return (
        <div key={key} className={styles.embed}>
          <ArticleCard addr={pointer} />
        </div>
      );
    }
    case "listItem":
      return null; // renderBlocks がまとめて <ul>/<ol> にする
  }
}

function renderInline(text: string): ReactNode[] {
  return parseInline(text).map((token, i) => renderInlineToken(token, i));
}

function renderInlineToken(token: MdInline, key: number): ReactNode {
  switch (token.type) {
    case "text":
      return token.value;
    case "bold":
      return <strong key={key}>{token.value}</strong>;
    case "italic":
      return <em key={key}>{token.value}</em>;
    case "code":
      return (
        <code key={key} className={styles.inlineCode}>
          {token.value}
        </code>
      );
    case "link":
      return <InlineLink key={key} label={token.label} href={token.href} />;
  }
}

/** http(s) は新しいタブの外部リンク、nostr 参照はアプリ内リンク（プロフィール / スレッド・記事） */
function InlineLink({ label, href }: { label: string; href: string }) {
  if (/^https?:\/\//i.test(href)) {
    return (
      <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  }
  const bech = href.replace(/^nostr:/i, "");
  try {
    const decoded = decode(bech);
    switch (decoded.type) {
      case "npub":
        return (
          <Link className={styles.link} to={hrefForProfile(decoded.data)}>
            {label}
          </Link>
        );
      case "nprofile":
        return (
          <Link className={styles.link} to={hrefForProfile(decoded.data.pubkey)}>
            {label}
          </Link>
        );
      case "note":
      case "nevent":
      case "naddr":
        return (
          <Link className={styles.link} to={hrefForEvent(bech)}>
            {label}
          </Link>
        );
      default:
        return label;
    }
  } catch {
    return label;
  }
}

/** 本文中の画像。プロキシが読めなければ元 URL（https のみ）で 1 度だけ取り直し、それも読めなければ隠す */
function ArticleImage({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(() => proxied(url, 800, 80));
  if (!src) return null;

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
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}
