import type { NostrEvent } from "nostr-tools/pure";

/**
 * NIP-51 の「セット」（addressable なリスト。ネイティブ Nip51Set.kt の写し）。
 * 対象はフォローセット kind:30000 とブックマークセット kind:30003 の 2 種類だけ（他 kind は今回扱わない）。
 * content が空でないものは NIP-04/44 で暗号化された非公開項目を持つが、他人のものは復号できない。
 * ここでは公開タグだけを解析し、非公開の有無だけ hasPrivate で伝える。
 */
export type Nip51Set = {
  kind: number;
  author: string;
  dTag: string;
  /** 表示名。title タグ、無ければ name タグ、それも無ければ d タグ */
  title: string;
  description: string;
  image: string | null;
  /** フォローセット(30000)のメンバー */
  members: readonly string[];
  /** ブックマークセット(30003)のイベント id */
  eventIds: readonly string[];
  /** ブックマークセット(30003)のアドレス参照（"kind:pubkey:d"）。記事等 */
  addresses: readonly string[];
  createdAt: number;
  /** 暗号化された非公開項目を持つか（他人のものは中身を出せない） */
  hasPrivate: boolean;
};

/** 対象とする NIP-51 セットの kind */
export const NIP51_SET_KINDS: readonly number[] = [30000, 30003];

/** 座標（同一なら版違い） */
export function nip51SetAddress(set: Pick<Nip51Set, "kind" | "author" | "dTag">): string {
  return `${set.kind}:${set.author}:${set.dTag}`;
}

/** 行に出す公開項目の件数 */
export function nip51SetCount(set: Pick<Nip51Set, "members" | "eventIds" | "addresses">): number {
  return set.members.length + set.eventIds.length + set.addresses.length;
}

function tagValue(event: NostrEvent, name: string): string | undefined {
  return event.tags.find((t) => t.length >= 2 && t[0] === name)?.[1];
}

function dTagOf(event: NostrEvent): string {
  return tagValue(event, "d") ?? "";
}

/** name タグの値（重複は畳み、空値・値なしのタグは無視。見えた順を保つ） */
function values(event: NostrEvent, name: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of event.tags) {
    if (tag.length < 2 || tag[0] !== name || tag[1] === "") continue;
    if (seen.has(tag[1])) continue;
    seen.add(tag[1]);
    out.push(tag[1]);
  }
  return out;
}

/** NIP-51 セットを解析する（ネイティブ parseNip51Set）。公開タグのみを見る（非公開は content 側で復号が要る） */
export function parseNip51Set(event: NostrEvent): Nip51Set {
  const d = dTagOf(event);
  return {
    kind: event.kind,
    author: event.pubkey,
    dTag: d,
    title: tagValue(event, "title") ?? tagValue(event, "name") ?? d,
    description: tagValue(event, "description") ?? "",
    image: tagValue(event, "image") ?? tagValue(event, "picture") ?? null,
    members: values(event, "p"),
    eventIds: values(event, "e"),
    addresses: values(event, "a"),
    createdAt: event.created_at,
    hasPrivate: event.content.trim() !== "",
  };
}

/**
 * イベント群を NIP-51 セットへ解析する（ネイティブ parseNip51Sets）。同一座標(kind:pubkey:d)は最新版だけを残し、
 * 新しい順に並べる。中身が空のセット（全項目が非公開 or 削除済み）も、非公開があるなら残す
 * （「見えないものがある」ことは伝える価値がある）。
 */
export function parseNip51Sets(events: readonly NostrEvent[]): Nip51Set[] {
  const latest = new Map<string, NostrEvent>();
  for (const event of events) {
    if (!NIP51_SET_KINDS.includes(event.kind)) continue;
    const key = `${event.kind}:${event.pubkey}:${dTagOf(event)}`;
    const current = latest.get(key);
    if (!current || current.created_at < event.created_at) latest.set(key, event);
  }
  return [...latest.values()]
    .map(parseNip51Set)
    .filter((set) => nip51SetCount(set) > 0 || set.hasPrivate)
    .sort((a, b) => b.createdAt - a.createdAt);
}
