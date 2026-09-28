import type { NostrEvent } from "nostr-tools/pure";

/**
 * 投稿への反応の集計（ネイティブの Nostr.sq engagementCountsForNote / reactionsForNoteWithAuthors /
 * repostersForNote と EventRepository.kt normalizeReaction の写し）。集計対象は最後の e タグがその投稿のもの。
 */

/** 最後の e タグ（小文字のみ）の値。無ければ null */
export function lastETagValue(event: NostrEvent): string | null {
  for (let i = event.tags.length - 1; i >= 0; i--) {
    const tag = event.tags[i];
    if (tag[0] === "e") return tag[1] ?? null;
  }
  return null;
}

/** id で重複を除き、最後の e タグが noteId のものだけ */
function targeting(events: readonly NostrEvent[], noteId: string, kinds: readonly number[]): NostrEvent[] {
  const seen = new Set<string>();
  const result: NostrEvent[] = [];
  for (const event of events) {
    if (seen.has(event.id) || !kinds.includes(event.kind) || lastETagValue(event) !== noteId) continue;
    seen.add(event.id);
    result.push(event);
  }
  return result;
}

/** リプライ = kind 1 / 1111、リポスト = kind 6 / 16 の件数 */
export function countEngagement(
  events: readonly NostrEvent[],
  noteId: string,
): { replies: number; reposts: number } {
  let replies = 0;
  let reposts = 0;
  for (const event of targeting(events, noteId, [1, 1111, 6, 16])) {
    if (event.kind === 1 || event.kind === 1111) replies++;
    else reposts++;
  }
  return { replies, reposts };
}

export type ReactionKey = { display: string; imageUrl: string | null };

/** リアクションの表示（+ と空 → ❤️、- → 👎、:code: は emoji タグの画像、それ以外は trim した文字） */
export function normalizeReaction(content: string, tags: string[][]): ReactionKey {
  const c = content.trim();
  if (c === "+" || c === "") return { display: "❤️", imageUrl: null };
  if (c === "-") return { display: "👎", imageUrl: null };
  if (c.length >= 2 && c.startsWith(":") && c.endsWith(":")) {
    const code = c.slice(1, -1);
    const tag = tags.find((t) => t[0] === "emoji" && t.length >= 3 && t[1] === code);
    return { display: c, imageUrl: tag?.[2] ?? null };
  }
  return { display: c, imageUrl: null };
}

/** count = 件数、people = した人（重複なし・新しい順） */
export type ReactionGroup = ReactionKey & { count: number; people: string[] };

/** リアクション（kind:7）を表示ごとにまとめる。グループは人数の多い順（同数は新しいものが先に現れた順） */
export function groupReactions(events: readonly NostrEvent[], noteId: string): ReactionGroup[] {
  const reactions = targeting(events, noteId, [7]).sort((a, b) => b.created_at - a.created_at);
  const groups = new Map<string, ReactionGroup>();
  for (const event of reactions) {
    const key = normalizeReaction(event.content, event.tags);
    const id = `${key.display}\n${key.imageUrl ?? ""}`;
    let group = groups.get(id);
    if (!group) {
      group = { ...key, count: 0, people: [] };
      groups.set(id, group);
    }
    group.count++;
    if (!group.people.includes(event.pubkey)) group.people.push(event.pubkey);
  }
  // Array.prototype.sort は安定なので、同数は最初に現れた順のまま
  return [...groups.values()].sort((a, b) => b.people.length - a.people.length);
}

/** リアクションの合計 = max(件数の和, 人数の和)（ネイティブの FocusNoteStats と同じ） */
export function reactionTotal(groups: readonly ReactionGroup[]): number {
  let count = 0;
  let people = 0;
  for (const g of groups) {
    count += g.count;
    people += g.people.length;
  }
  return Math.max(count, people);
}

/** リポスト（kind:6 / 16）した人。pubkey ごとの最新のリポストが新しい順 */
export function repostersOf(events: readonly NostrEvent[], noteId: string): string[] {
  const latest = new Map<string, number>();
  for (const event of targeting(events, noteId, [6, 16])) {
    const at = latest.get(event.pubkey);
    if (at === undefined || event.created_at > at) latest.set(event.pubkey, event.created_at);
  }
  return [...latest.entries()].sort((a, b) => b[1] - a[1]).map(([pubkey]) => pubkey);
}
