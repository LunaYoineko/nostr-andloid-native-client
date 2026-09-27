import { getNip10References } from "applesauce-common/helpers/threading";
import type { Filter } from "applesauce-core/helpers/filter";
import type { NostrEvent } from "nostr-tools/pure";
import { replyParentPointerOf } from "../../lib/content/tags";

/**
 * スレッドの購読条件と並べ方（ネイティブの EventRepository.kt subscribeThread / threadAnchorIds /
 * threadRootAddress / buildThread の写し）。React に依存しない純関数。
 */

/** 返信（kind:1 / 1111）の取得上限 */
export const THREAD_REPLY_LIMIT = 200;
/** 起点への反応（kind:7 / 6 / 16）の取得上限 */
export const ENGAGEMENT_LIMIT = 500;

/** focusId = 開いた投稿、ids = [focusId, rootId]（重複なし）、address = ルートがアドレスのときの `kind:pubkey:d` */
export type ThreadAnchors = { focusId: string; ids: string[]; rootId: string; address: string | null };

/** スレッドの root の id。kind:1 は NIP-10 の root、kind:1111 は最初の E タグ。それ以外・無しは null */
export function threadRootIdOf(event: NostrEvent): string | null {
  if (event.kind === 1) return getNip10References(event).root?.e?.id ?? null;
  if (event.kind === 1111) return firstTagValue(event, "E");
  return null;
}

/** ルートがアドレスのときの `kind:pubkey:d`。kind:1111 は最初の A タグ、30000〜39999 は自分自身。それ以外は null */
export function threadRootAddressOf(event: NostrEvent): string | null {
  if (event.kind === 1111) return firstTagValue(event, "A");
  if (event.kind >= 30000 && event.kind <= 39999) {
    const d = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
    return `${event.kind}:${event.pubkey}:${d}`;
  }
  return null;
}

/** 最初の name タグの値（空文字は無視） */
function firstTagValue(event: NostrEvent, name: string): string | null {
  const value = event.tags.find((t) => t[0] === name && typeof t[1] === "string" && t[1] !== "")?.[1];
  return value ?? null;
}

/** 起点（未取得なら undefined）から購読の起点 id とルートのアドレスを決める */
export function threadAnchors(focusId: string, focus: NostrEvent | undefined): ThreadAnchors {
  const rootId = (focus && threadRootIdOf(focus)) ?? focusId;
  return {
    focusId,
    ids: [...new Set([focusId, rootId])],
    rootId,
    address: focus ? threadRootAddressOf(focus) : null,
  };
}

/** effect の依存に使うキー（ids と address が同じなら同じ） */
export function anchorsKey(a: ThreadAnchors): string {
  return `${a.ids.join(",")}|${a.address ?? ""}`;
}

/** リレーへ投げるフィルタ（ネイティブの subscribeThread と同じ順） */
export function threadRequestFilters(a: ThreadAnchors): Filter[] {
  const filters: Filter[] = [
    { ids: a.ids },
    { kinds: [1, 1111], "#e": a.ids, limit: THREAD_REPLY_LIMIT },
    { kinds: [1111], "#E": a.ids, limit: THREAD_REPLY_LIMIT },
  ];
  if (a.address) {
    filters.push({ kinds: [1111], "#A": [a.address], limit: THREAD_REPLY_LIMIT });
    const parts = a.address.split(":");
    if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
      filters.push({
        kinds: [Number(parts[0])],
        authors: [parts[1]],
        "#d": [parts.slice(2).join(":")],
        limit: 1,
      });
    }
  }
  return filters;
}

/** EventStore から読む条件（limit なし） */
export function threadViewFilters(a: ThreadAnchors): Filter[] {
  const filters: Filter[] = [
    { ids: a.ids },
    { kinds: [1, 1111], "#e": a.ids },
    { kinds: [1111], "#E": a.ids },
  ];
  if (a.address) filters.push({ kinds: [1111], "#A": [a.address] });
  return filters;
}

export type ThreadEntry = { event: NostrEvent; depth: number; isRoot: boolean; isFocused: boolean };

/** created_at 昇順、同時刻は id 昇順 */
function byTimeThenId(a: NostrEvent, b: NostrEvent): number {
  if (a.created_at !== b.created_at) return a.created_at - b.created_at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * 行（kind:1 / 1111）を返信ツリーの深さ優先の順に並べる。親 = #454 の replyParentPointerOf。
 * 親が集合に無い行が起点になり、子は created_at 昇順。親子が循環する行は起点にならないので出ない。
 */
export function buildThread(events: readonly NostrEvent[], focusId: string, rootId: string): ThreadEntry[] {
  const notes = new Map<string, NostrEvent>();
  for (const event of events) {
    if ((event.kind === 1 || event.kind === 1111) && !notes.has(event.id)) notes.set(event.id, event);
  }

  const children = new Map<string, NostrEvent[]>();
  const starts: NostrEvent[] = [];
  for (const event of notes.values()) {
    const parent = replyParentPointerOf(event)?.id ?? null;
    if (parent !== null && notes.has(parent)) {
      const list = children.get(parent);
      if (list) list.push(event);
      else children.set(parent, [event]);
    } else {
      starts.push(event);
    }
  }
  starts.sort(byTimeThenId);
  for (const list of children.values()) list.sort(byTimeThenId);

  const entries: ThreadEntry[] = [];
  const visited = new Set<string>();
  const visit = (event: NostrEvent, depth: number) => {
    if (visited.has(event.id)) return;
    visited.add(event.id);
    entries.push({ event, depth, isRoot: event.id === rootId, isFocused: event.id === focusId });
    for (const child of children.get(event.id) ?? []) visit(child, depth + 1);
  };
  for (const start of starts) visit(start, 0);
  return entries;
}
