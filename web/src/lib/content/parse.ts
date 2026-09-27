import { getHashtagTag } from "applesauce-common/helpers/hashtag";
import { type Content, eolMetadata, findAndReplace, type Root } from "applesauce-content/nast";
import {
  blossomURIs,
  emojis,
  galleries,
  getParsedContent,
  links,
  nostrMentions,
  type textNoteTransformers,
} from "applesauce-content/text";
import type { NostrEvent } from "nostr-tools/pure";
import { mediaKindOf, trimUrlTail } from "../media";

/** unified の Transformer<Root>（unified は直接の依存に無いので applesauce の型から取り出す） */
type Transformer = ReturnType<(typeof textNoteTransformers)[number]>;

/** 本文の構文木のキャッシュキー（applesauce 既定の TextNoteContentSymbol とは別の木） */
export const NOTE_CONTENT_KEY = Symbol.for("nostrism.note-content");

function isMedia(url: string): boolean {
  return mediaKindOf(url) !== null;
}

/**
 * 画像・動画・YouTube の URL を本文から取り除く（ネイティブの Embed.kt extractMediaUrls と同じ）。
 * 取り除いたときだけ、隣り合う文字を 1 つにまとめて連続空白・3 連以上の改行を潰し、前後を trim する。
 */
export function stripMediaLinks(): Transformer {
  return (tree: Root) => {
    let removed = false;
    const kept: Content[] = [];
    for (const node of tree.children) {
      if (node.type === "link" && isMedia(node.value)) {
        removed = true;
      } else if (node.type === "gallery" && node.links.some(isMedia)) {
        removed = true;
        // 画像と非画像（svg 等）が混ざっていれば、非画像だけをリンクに戻す。
        // gallery は間の改行を飲み込んでいるので、リンク同士の間に改行を挟んでくっつかないようにする
        const rest = node.links.filter((href) => !isMedia(href));
        rest.forEach((href, i) => {
          if (i > 0) kept.push({ type: "text", value: "\n" });
          kept.push({ type: "link", href, value: href });
        });
      } else {
        kept.push(node);
      }
    }
    if (!removed) return;

    const merged: Content[] = [];
    for (const node of kept) {
      const last = merged[merged.length - 1];
      if (node.type === "text" && last?.type === "text") {
        merged[merged.length - 1] = { type: "text", value: last.value + node.value };
      } else {
        merged.push(node.type === "text" ? { type: "text", value: node.value } : node);
      }
    }
    for (const node of merged) {
      if (node.type === "text") node.value = node.value.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
    }
    tree.children = trimEdges(merged);
  };
}

/** 先頭の text を trimStart・末尾の text を trimEnd し、空になった text を捨てる（新しい配列を返す） */
function trimEdges(children: Content[]): Content[] {
  const out = [...children];
  const first = out[0];
  if (first?.type === "text") out[0] = { ...first, value: first.value.trimStart() };
  const lastIndex = out.length - 1;
  const last = out[lastIndex];
  if (last?.type === "text") out[lastIndex] = { ...last, value: last.value.trimEnd() };
  return out.filter((node) => node.type !== "text" || node.value !== "");
}

/**
 * encoded と一致する mention（引用カードに出した参照）を除いた木。直後の text の先頭の改行 1 つも落とし、
 * 前後の text を trim する。除くものが無ければ元の木をそのまま返す（キャッシュ済みの木は書き換えない）。
 */
export function withoutMention(root: Root, encoded: string | null | undefined): Root {
  const hidden = (node: Content) => node.type === "mention" && node.encoded === encoded;
  if (!encoded || !root.children.some(hidden)) return root;
  const children: Content[] = [];
  let afterHidden = false;
  for (const node of root.children) {
    if (hidden(node)) {
      afterHidden = true;
      continue;
    }
    if (afterHidden && node.type === "text" && node.value.startsWith("\n")) {
      children.push({ ...node, value: node.value.slice(1) });
    } else {
      children.push(node);
    }
    afterHidden = false;
  }
  return { ...root, children: trimEdges(children) };
}

/** 描く本文が無い（空白だけの text しか無い）か */
export function isBlankContent(root: Root): boolean {
  return root.children.every((node) => node.type === "text" && node.value.trim() === "");
}

/**
 * #タグ。applesauce 既定の hashtags() は t タグが無いとタグにしないが、ネイティブに合わせて t タグ無しでもタグにする。
 * findAndReplace は text ノードにしか当たらないので、URL 中の # は対象にならない。
 */
export function hashtagsAny(): Transformer {
  return (tree: Root) => {
    const event = tree.event;
    findAndReplace(tree, [
      [
        /(?<=^|[^\p{L}\p{N}_#/])#([\p{L}\p{N}\p{M}_]+)/gu,
        (_, name) => ({
          type: "hashtag",
          name,
          hashtag: name.toLowerCase(),
          tag: (event && getHashtagTag(event, name)) ?? undefined,
        }),
      ],
    ]);
  };
}

/** 本文の構文木を組み立てる手順（applesauce-content の text/imeta は使わない） */
export const noteTransformers = [
  blossomURIs,
  links,
  nostrMentions,
  galleries,
  stripMediaLinks,
  emojis,
  hashtagsAny,
  eolMetadata,
];

/** 1 ノートの本文の構文木（イベントごとにキャッシュされる） */
export function parseNoteContent(event: NostrEvent): Root {
  return getParsedContent(event, undefined, noteTransformers, NOTE_CONTENT_KEY);
}

/** URL と末尾の句読点を分ける（"https://x.co/a." → ["https://x.co/a", "."]） */
export function splitTrailingPunct(value: string): [string, string] {
  const url = trimUrlTail(value);
  return [url, value.slice(url.length)];
}
