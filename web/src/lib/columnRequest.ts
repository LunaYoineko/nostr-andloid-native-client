import type { Filter } from "applesauce-core/helpers/filter";
import type { NostrEvent } from "nostr-tools/pure";
import type { ColumnSpec, ReqFilter } from "./columns";

/**
 * カラム → REQ（どのリレーへ何を投げるか）と、EventStore から読む条件。
 * ネイティブの EventRepository の subscribeColumn / subscribeFollowing / subscribeNotifications の分岐の写し。
 */

/** 通常のカラムの取得上限 */
export const COLUMN_LIMIT = 100;
/** 検索は取りこぼしが多いので多めに取る */
export const SEARCH_FETCH_LIMIT = 300;
export const NOTIF_FETCH_LIMIT = 200;
/** NIP-50 検索対応リレー（接続中のリレーが未対応でも結果を取れるように） */
export const SEARCH_RELAYS: readonly string[] = [
  "wss://relay.nostr.band",
  "wss://relay.noswhere.sh",
  "wss://search.nos.today",
];
/** kind:1 本文 + kind:6/16 リポスト + kind:5 削除 + kind:1111 コメント */
export const FOLLOWING_KINDS = [1, 6, 16, 5, 1111];
/** 自分宛て（#p）の 投稿・リポスト・リアクション・Zap・コメント */
export const NOTIF_REQ_KINDS = [1, 6, 16, 7, 9735, 1111];
/** EOSE を返さない/遅いリレーだけでも「読み込み中」を出し続けない */
export const LOADING_TIMEOUT_MS = 8_000;
/** 過去読みは 1 回投げてこの時間で CLOSE する */
export const OLDER_TIMEOUT_MS = 6_000;

// kind:5 は EventStore が削除として処理するので表示の対象から外す
const FOLLOWING_VIEW_KINDS = [1, 6, 16, 1111];

export type RequestPlan = { relays: readonly string[]; filters: Filter[] } | null;
export type ViewPlan = { filters: Filter[]; predicate?: (e: NostrEvent) => boolean };
export type Ctx = { me: string | null; follows: readonly string[] | null; relays: readonly string[] };

/** ReqFilter → NIP-01 のフィルタ（ネイティブの toProtocol） */
export function toProtocol(f: ReqFilter, limit: number): Filter {
  const filter: Filter = { kinds: f.kinds.length > 0 ? f.kinds : [1] };
  if (f.authors.length > 0) filter.authors = f.authors;
  if (f.hashtags.length > 0) filter["#t"] = f.hashtags;
  if (f.channelId !== null) filter["#e"] = [f.channelId];
  if (f.search !== null) filter.search = f.search;
  filter.limit = limit;
  return filter;
}

/** キーワード・タグフィードのフィルタ群（1 語 = 1 フィルタ + #t 1 つ。同じ REQ 内なので OR） */
export function toSearchProtocols(f: ReqFilter, limit: number): Filter[] {
  return [
    ...f.words.map((w) => ({ kinds: [1], search: w, limit })),
    ...(f.hashtags.length > 0 ? [{ kinds: [1], "#t": f.hashtags, limit }] : []),
  ];
}

function followAuthors(follows: readonly string[], me: string | null): string[] {
  return [...new Set(me ? [...follows, me] : follows)];
}

/** カラムの REQ。null = REQ を張らない（未ログイン・Web で未対応の種別） */
export function requestFor(spec: ColumnSpec, ctx: Ctx): RequestPlan {
  const f = spec.filter;
  switch (spec.kind) {
    case "FOLLOWING":
      if (!ctx.follows || ctx.follows.length === 0) {
        return { relays: ctx.relays, filters: [{ kinds: [1], limit: COLUMN_LIMIT }] };
      }
      return {
        relays: ctx.relays,
        filters: [
          { kinds: FOLLOWING_KINDS, authors: followAuthors(ctx.follows, ctx.me), limit: COLUMN_LIMIT },
        ],
      };
    case "NOTIFICATIONS":
      // カラムの filter.kinds は REQ にも表示（viewFor）にも使わない（ネイティブと同じ）
      if (!ctx.me) return null;
      return {
        relays: ctx.relays,
        filters: [{ kinds: NOTIF_REQ_KINDS, "#p": [ctx.me], limit: NOTIF_FETCH_LIMIT }],
      };
    case "FAVS":
      if (!ctx.me) return null;
      return { relays: ctx.relays, filters: [{ kinds: [7], authors: [ctx.me], limit: COLUMN_LIMIT }] };
    case "DM":
    case "THREAD":
    case "CHANNEL_LIST":
    case "CHANNEL_ROOM":
      return null;
  }
  if (spec.kind === "GLOBAL" && f.words.length > 0) {
    return { relays: SEARCH_RELAYS, filters: toSearchProtocols(f, SEARCH_FETCH_LIMIT) };
  }
  if (spec.kind === "GLOBAL" && f.search !== null && f.search.trim() !== "") {
    return { relays: SEARCH_RELAYS, filters: [toProtocol(f, SEARCH_FETCH_LIMIT)] };
  }
  if (f.relays.length > 0) return { relays: f.relays, filters: [toProtocol(f, COLUMN_LIMIT)] };
  return { relays: ctx.relays, filters: [toProtocol(f, COLUMN_LIMIT)] };
}

/** EventStore から読む条件（limit なし・kind:5 は含めない）。predicate は読んだ後の絞り込み */
export function viewFor(spec: ColumnSpec, ctx: Ctx): ViewPlan {
  const f = spec.filter;
  switch (spec.kind) {
    case "FOLLOWING":
      if (!ctx.follows || ctx.follows.length === 0) return { filters: [{ kinds: [1] }] };
      return { filters: [{ kinds: FOLLOWING_VIEW_KINDS, authors: followAuthors(ctx.follows, ctx.me) }] };
    case "NOTIFICATIONS": {
      // カラムの filter.kinds（表示する種別）は見ない。全種別を出す（ネイティブの NotificationsColumn と同じ）
      const me = ctx.me;
      if (!me) return { filters: [] };
      return { filters: [{ kinds: NOTIF_REQ_KINDS, "#p": [me] }], predicate: (e) => e.pubkey !== me };
    }
    case "FAVS":
      if (!ctx.me) return { filters: [] };
      return { filters: [{ kinds: [7], authors: [ctx.me] }] };
  }
  if (spec.kind === "GLOBAL" && f.words.length > 0) {
    const words = f.words.map((w) => w.toLowerCase());
    const hashtags = new Set(f.hashtags);
    return {
      filters: [{ kinds: [1] }],
      predicate: (e) => {
        const content = e.content.toLowerCase();
        return (
          words.some((w) => content.includes(w)) || e.tags.some((t) => t[0] === "t" && hashtags.has(t[1]))
        );
      },
    };
  }
  // EventStore のメモリ DB は search 付きのフィルタに常に空を返す（matchFilters は無視する）ので外し、
  // 語句の一致はこちらで見る
  const { limit: _limit, search: _search, ...filter } = toProtocol(f, 0);
  const search = f.search;
  if (search !== null && search.trim() !== "") {
    return { filters: [filter], predicate: (e) => matchesSearch(e, search) };
  }
  return { filters: [filter] };
}

// NIP-50 の拡張オプション（include:spam, language:en など）
const SEARCH_OPTION = /^[\w-]+:\S+$/;

/**
 * NIP-50 の search 文字列をクライアント側で照合する。空白で区切った語をすべて本文が含めば true（大文字小文字は無視）。
 * #tag の語は t タグ（小文字）の一致でもよい。key:value の語（拡張オプション）は無視する。
 */
export function matchesSearch(event: NostrEvent, search: string): boolean {
  const terms = search
    .split(/\s+/)
    .map((term) => term.toLowerCase())
    .filter((term) => term !== "" && !SEARCH_OPTION.test(term));
  const content = event.content.toLowerCase();
  return terms.every((term) => {
    if (content.includes(term)) return true;
    if (!term.startsWith("#") || term.length < 2) return false;
    const tag = term.slice(1);
    return event.tags.some((t) => t[0] === "t" && typeof t[1] === "string" && t[1].toLowerCase() === tag);
  });
}

/** kind:0 / 3 / 10002 を広く持つリレー（ネイティブの EventRepository.INDEXER_RELAYS と同じ順） */
export const INDEXER_RELAYS: readonly string[] = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

/** アウトボックス購読（著者の書き込みリレーへの追加購読）を付ける著者数の上限 */
export const OUTBOX_MAX_AUTHORS = 3;

/**
 * アウトボックス購読の対象の著者（ネイティブ subscribeColumn の分岐順）。
 * 著者指定が 1〜3 人で、単語検索・search・relays 指定の無いカラムだけ。対象外は null。
 */
export function outboxAuthorsFor(spec: ColumnSpec): string[] | null {
  switch (spec.kind) {
    case "FOLLOWING":
    case "NOTIFICATIONS":
    case "FAVS":
    case "DM":
    case "THREAD":
    case "CHANNEL_LIST":
    case "CHANNEL_ROOM":
      return null;
  }
  const f = spec.filter;
  if (f.words.length > 0) return null;
  if (f.search !== null && f.search.trim() !== "") return null;
  if (f.relays.length > 0) return null;
  const authors = [...new Set(f.authors)];
  return authors.length >= 1 && authors.length <= OUTBOX_MAX_AUTHORS ? authors : null;
}
