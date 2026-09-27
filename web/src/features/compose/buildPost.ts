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

/** 新規投稿（ネイティブ publishNote）: t → emoji → メンションの p → content-warning */
export function buildNote(content: string, cw: string | null, ctx: PostContext): EventDraft {
  return {
    kind: 1,
    content,
    tags: withHints([...bodyTags(content, ctx), ...mentionPTags(content), ...cwTags(cw)], ctx),
  };
}

/**
 * 返信（ネイティブ publishReply）。kind:1111 へは kind:1111（NIP-22）、それ以外は kind:1（NIP-10）。
 * 返信タグ → t → emoji → 継承済みを除くメンションの p → content-warning。
 */
export function buildReply(
  target: NostrEvent,
  content: string,
  cw: string | null,
  ctx: PostContext,
): EventDraft {
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
    content,
    tags: withHints(
      [...head, ...bodyTags(content, ctx), ...mentionPTags(content, existing), ...cwTags(cw)],
      ctx,
    ),
  };
}

/**
 * 引用（ネイティブ publishQuote）: q → 作者の p → t → emoji → 作者を除くメンションの p → content-warning。
 * 本文の末尾に q のヒント入りの nevent を足す（タグ・使用履歴は足す前の本文から取る）。
 */
export function buildQuote(
  target: NostrEvent,
  content: string,
  cw: string | null,
  ctx: PostContext,
): EventDraft {
  const tags = withHints(
    [
      ["q", target.id, "", target.pubkey],
      ["p", target.pubkey],
      ...bodyTags(content, ctx),
      ...mentionPTags(content, [target.pubkey]),
      ...cwTags(cw),
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
    content: content.trim() === "" ? `nostr:${ref}` : `${content}\nnostr:${ref}`,
    tags,
  };
}
