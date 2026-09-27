import type { Gallery, Hashtag, Link, Mention, Text } from "applesauce-content/nast";
import type { ComponentMap } from "applesauce-react/helpers";
import { useRenderedContent } from "applesauce-react/hooks/use-rendered-content";
import type { NostrEvent } from "nostr-tools/pure";
import { displayName, useProfile } from "../../nostr/loaders";
import styles from "./NoteContent.module.css";

const EXTERNAL_LINK = { target: "_blank", rel: "noopener noreferrer nofollow ugc" } as const;

/** http(s) だけを <a> にする（javascript: 等は文字のまま） */
function isWebUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function TextNode({ node }: { node: Text }) {
  return node.value;
}

function LinkNode({ node }: { node: Link }) {
  if (!isWebUrl(node.href)) return node.value;
  return (
    <a className={styles.link} href={node.href} {...EXTERNAL_LINK}>
      {node.value}
    </a>
  );
}

// 連続した画像 URL は applesauce が gallery にまとめる。この段階ではリンクとして 1 行ずつ出す
function GalleryNode({ node }: { node: Gallery }) {
  return (
    <span className={styles.gallery}>
      {node.links.map((href, i) =>
        isWebUrl(href) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 同じ URL が並ぶことがあり、位置が唯一の識別子
          <a key={i} className={styles.link} href={href} {...EXTERNAL_LINK}>
            {href}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: 同上
          <span key={i}>{href}</span>
        ),
      )}
    </span>
  );
}

function HashtagNode({ node }: { node: Hashtag }) {
  return <span className={styles.hashtag}>#{node.name}</span>;
}

function ProfileMention({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  return <span className={styles.mention}>@{displayName(profile, pubkey)}</span>;
}

function MentionNode({ node }: { node: Mention }) {
  const { decoded } = node;
  if (decoded.type === "npub") return <ProfileMention pubkey={decoded.data} />;
  if (decoded.type === "nprofile") return <ProfileMention pubkey={decoded.data.pubkey} />;
  // 投稿・記事への参照はこの段階では短縮した識別子だけを出す
  return <span className={styles.mention}>{`${node.encoded.slice(0, 16)}…`}</span>;
}

// カスタム絵文字（NIP-30）と blossom: はこの段階では書かれた文字のまま出す
function RawNode({ node }: { node: { raw: string } }) {
  return node.raw;
}

const components: ComponentMap = {
  text: TextNode,
  link: LinkNode,
  gallery: GalleryNode,
  hashtag: HashtagNode,
  mention: MentionNode,
  emoji: RawNode,
  blossom: RawNode,
};

/**
 * 本文。applesauce-content の構文木（テキスト / リンク / #タグ / メンション）を React 要素にする。
 * HTML としては一切解釈しない（dangerouslySetInnerHTML は使わない）。
 */
export function NoteContent({ event }: { event: NostrEvent }) {
  const content = useRenderedContent(event, components);
  return <div className={styles.content}>{content}</div>;
}
