import { neventEncode } from "nostr-tools/nip19";
import type { NostrEvent } from "nostr-tools/pure";
import type { EventDraft } from "../../nostr/publish";
import type { RelayHintLookup } from "./relayHints";
import {
  emojiTagsIn,
  fillRelayHints,
  hashtagsIn,
  mentionPTags,
  nip10ReplyTags,
  nip22ReplyTags,
  rootOf,
} from "./tags";

/** 投稿の組み立てに要るもの（自分・既知の絵文字・リレーヒント・ストアの投稿） */
export type PostContext = {
  me: string;
  emojis: ReadonlyMap<string, string>;
  hints: RelayHintLookup;
  lookup(id: string): NostrEvent | undefined;
};

/** アップロード済みの添付（本文へ足す URL と imeta の値） */
export type PostMedia = {
  kind: "image" | "video";
  url: string;
  /** MIME */
  m?: string;
  /** "WxH" */
  dim?: string;
  blurhash?: string;
  /** SHA-256（サーバーが返したもの） */
  x?: string;
};

/** 画像 → 動画の順（ネイティブ ComposeSheet は画像の URL の後に動画の URL を並べる） */
function mediaOrder(media: readonly PostMedia[]): PostMedia[] {
  return [...media.filter((m) => m.kind === "image"), ...media.filter((m) => m.kind === "video")];
}

/**
 * 本文の後ろに添付の URL を 1 行ずつ足す（ネイティブ ComposeSheet: 本文（空白なら無し）→ 画像 → 動画を "\n" でつなぐ）。
 * タグ・引用の nevent はこの後の本文から作る（ネイティブも URL を足した本文を publishNote 等へ渡す）。
 */
export function withMediaUrls(content: string, media: readonly PostMedia[]): string {
  const urls = mediaOrder(media).map((m) => m.url);
  if (urls.length === 0) return content;
  return [...(content.trim() === "" ? [] : [content]), ...urls].join("\n");
}

/** NIP-92 の imeta（本文の URL と同じ順。url → m → dim → blurhash → x、無い項目は省く） */
export function imetaTags(media: readonly PostMedia[]): string[][] {
  return mediaOrder(media).map((m) => {
    const tag = ["imeta", `url ${m.url}`];
    if (m.m) tag.push(`m ${m.m}`);
    if (m.dim) tag.push(`dim ${m.dim}`);
    if (m.blurhash) tag.push(`blurhash ${m.blurhash}`);
    if (m.x) tag.push(`x ${m.x}`);
    return tag;
  });
}

/** 本文から取るタグ（t → emoji） */
function bodyTags(content: string, ctx: PostContext): string[][] {
  return [...hashtagsIn(content).map((t) => ["t", t]), ...emojiTagsIn(content, ctx.emojis)];
}

function cwTags(cw: string | null): string[][] {
  return cw === null ? [] : [["content-warning", cw]];
}

function withHints(tags: string[][], ctx: PostContext): string[][] {
  return fillRelayHints(
    tags,
    (id) => ctx.hints.eventHint(id),
    (pk) => ctx.hints.pubkeyHint(pk),
  );
}

/**
 * 新規投稿（ネイティブ publishNote）: t → emoji → メンションの p → content-warning → imeta。
 * 添付があれば本文の後ろに URL を足し、タグはその本文から取る。
 */
export function buildNote(
  content: string,
  cw: string | null,
  ctx: PostContext,
  media: readonly PostMedia[] = [],
): EventDraft {
  const body = withMediaUrls(content, media);
  return {
    kind: 1,
    content: body,
    tags: withHints([...bodyTags(body, ctx), ...mentionPTags(body), ...cwTags(cw), ...imetaTags(media)], ctx),
  };
}

/**
 * 返信（ネイティブ publishReply）。kind:1111 へは kind:1111（NIP-22）、それ以外は kind:1（NIP-10）。
 * 返信タグ → t → emoji → 継承済みを除くメンションの p → content-warning → imeta。
 */
export function buildReply(
  target: NostrEvent,
  content: string,
  cw: string | null,
  ctx: PostContext,
  media: readonly PostMedia[] = [],
): EventDraft {
  const body = withMediaUrls(content, media);
  let kind: number;
  let head: string[][];
  let existing: string[];
  if (target.kind === 1111) {
    kind = 1111;
    head = nip22ReplyTags(target.id, target.pubkey, target.tags);
    existing = head.filter((t) => t.length >= 2 && (t[0] === "p" || t[0] === "P")).map((t) => t[1]);
  } else {
    kind = 1;
    const rootId = rootOf(target.tags);
    const rootAuthor =
      rootId === null || rootId === target.id ? target.pubkey : (ctx.lookup(rootId)?.pubkey ?? null);
    head = nip10ReplyTags({
      targetId: target.id,
      targetPubkey: target.pubkey,
      targetTags: target.tags,
      rootAuthor,
      selfPubkey: ctx.me,
    });
    existing = head.filter((t) => t.length >= 2 && t[0] === "p").map((t) => t[1]);
  }
  return {
    kind,
    content: body,
    tags: withHints(
      [...head, ...bodyTags(body, ctx), ...mentionPTags(body, existing), ...cwTags(cw), ...imetaTags(media)],
      ctx,
    ),
  };
}

/**
 * 引用（ネイティブ publishQuote）: q → 作者の p → t → emoji → 作者を除くメンションの p → content-warning → imeta。
 * 本文（添付の URL を足した後）の末尾に q のヒント入りの nevent を足す（タグ・使用履歴は nevent を足す前の本文から取る）。
 */
export function buildQuote(
  target: NostrEvent,
  content: string,
  cw: string | null,
  ctx: PostContext,
  media: readonly PostMedia[] = [],
): EventDraft {
  const body = withMediaUrls(content, media);
  const tags = withHints(
    [
      ["q", target.id, "", target.pubkey],
      ["p", target.pubkey],
      ...bodyTags(body, ctx),
      ...mentionPTags(body, [target.pubkey]),
      ...cwTags(cw),
      ...imetaTags(media),
    ],
    ctx,
  );
  const hint = tags[0][2] || null;
  const ref = neventEncode({
    id: target.id,
    author: target.pubkey,
    kind: target.kind,
    relays: hint ? [hint] : [],
  });
  return {
    kind: 1,
    content: body.trim() === "" ? `nostr:${ref}` : `${body}\nnostr:${ref}`,
    tags,
  };
}
