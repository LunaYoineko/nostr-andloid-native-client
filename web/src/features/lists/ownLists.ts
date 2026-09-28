import type { NostrEvent } from "nostr-tools/pure";
import { useMemo } from "react";
import { Subscription, timer } from "rxjs";
import { create } from "zustand";
import { LOADING_TIMEOUT_MS } from "../../lib/columnRequest";
import { unixNow } from "../../lib/time";
import { OwnReplaceableUnreachableError, refetchOwnReplaceable } from "../../nostr/ownReplaceable";
import { subscribe } from "../../nostr/pool";
import { PublishError, type PublishFailure, publishEvent } from "../../nostr/publish";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { buildEIdListTemplate, type EIdListState, parseEIdList } from "./eidList";

/**
 * 自分のブックマーク（NIP-51 kind:10003）と固定投稿（kind:10001）。読む（起動時から購読）と
 * 変える（1 件のトグル。#478 の規則）の両方（ネイティブ EventRepository.kt の bookmarkList / pinnedList /
 * toggleBookmark / togglePinned の写し。リレーとの行き来は muteSync.ts と同じ置き方）。
 */

/** unreachable = 発行の直前の取り直しでどのリレーからも応答が無かった（手元の版が古い可能性があり、発行すると最新の内容を消しうる） */
export type OwnListFailure = "unreachable" | PublishFailure;

export class OwnListError extends Error {
  readonly reason: OwnListFailure;
  readonly kind: number;

  constructor(reason: OwnListFailure, kind: number, options?: ErrorOptions) {
    super(`own e-id list failed: ${reason} (kind ${kind})`, options);
    this.name = "OwnListError";
    this.reason = reason;
    this.kind = kind;
  }
}

// ---- 読む（ネイティブ updateBookmarkList / updatePinnedList） ----

type OwnListsState = {
  /** null = まだ分からない（未ログイン・購読が一度も返っていない）。⋯ メニューはこの間、項目を出さない */
  bookmarks: EIdListState | null;
  pinned: EIdListState | null;
};

export const useOwnLists = create<OwnListsState>()(() => ({ bookmarks: null, pinned: null }));

/**
 * kind の自分の置換可能イベントを購読し、e タグの id 一覧をストアへ入れる。中身の投稿も ids で取得する。
 * 最初の EOSE（または 8 秒）までに届かなければ「まだ無い」（空のリスト）とする。
 */
function followOwnEIdList(me: string, kind: number, setState: (list: EIdListState) => void): Subscription {
  const subscription = new Subscription();
  let latest: NostrEvent | undefined;
  let settled = false;
  let shown: string | null | undefined;
  let items: Subscription | undefined;

  const show = () => {
    if (!latest && !settled) return;
    const id = latest?.id ?? null;
    if (id === shown) return;
    shown = id;
    const list = parseEIdList(latest ?? null);
    setState(list);
    items?.unsubscribe();
    items =
      list.ids.length > 0 ? subscribe({ ids: list.ids, limit: list.ids.length }).subscribe() : undefined;
    if (items) subscription.add(items);
  };
  const settle = () => {
    if (settled) return;
    settled = true;
    show();
  };

  subscription.add(
    eventStore.replaceable({ kind, pubkey: me }).subscribe((event) => {
      latest = event;
      show();
    }),
  );
  subscription.add(subscribe({ kinds: [kind], authors: [me], limit: 1 }).subscribe(settle));
  subscription.add(timer(LOADING_TIMEOUT_MS).subscribe(settle));
  return subscription;
}

/**
 * ログイン中のアカウントに合わせて、自分のブックマーク・固定投稿の購読を張り替える（起動時に 1 度）。
 * ログアウト・アカウントの切り替えではストアを空（未取得）に戻す。戻り値は止める関数。
 */
export function startOwnLists(): () => void {
  let current: { me: string; subscription: Subscription } | null = null;
  const follow = (me: string | null) => {
    if ((current?.me ?? null) === me) return;
    if (current) {
      current.subscription.unsubscribe();
      current = null;
    }
    useOwnLists.setState({ bookmarks: null, pinned: null });
    if (me) {
      const subscription = new Subscription();
      subscription.add(followOwnEIdList(me, 10003, (list) => useOwnLists.setState({ bookmarks: list })));
      subscription.add(followOwnEIdList(me, 10001, (list) => useOwnLists.setState({ pinned: list })));
      current = { me, subscription };
    }
  };
  follow(useSession.getState().pubkey);
  const unsubscribe = useSession.subscribe((state) => follow(state.pubkey));
  return () => {
    unsubscribe();
    current?.subscription.unsubscribe();
    current = null;
  };
}

/** 投稿がブックマーク済みか（null = 自分のブックマークが未取得。⋯ メニューはこの間、項目を出さない） */
export function useIsBookmarked(id: string): boolean | null {
  return useOwnLists((s) => (s.bookmarks ? s.bookmarks.ids.includes(id) : null));
}

/** 投稿がプロフィールに固定済みか（null = 自分の固定投稿が未取得） */
export function useIsPinned(id: string): boolean | null {
  return useOwnLists((s) => (s.pinned ? s.pinned.ids.includes(id) : null));
}

const NO_IDS: string[] = [];

/**
 * 設定「ブックマーク」用: 追加の新しい順（末尾が上）の id 一覧（ネイティブ bookmarkedNotesFlow の asReversed）。
 * bookmarks が変わったときだけ作り直す（毎回新しい配列を返すと値が変わったと見なされ描画が無限に回る）。
 */
export function useBookmarkedIds(): string[] {
  const bookmarks = useOwnLists((s) => s.bookmarks);
  return useMemo(() => (bookmarks ? bookmarks.ids.slice().reverse() : NO_IDS), [bookmarks]);
}

// ---- 変える（ネイティブ toggleBookmark / togglePinned） ----

/**
 * kind の自分のリストへ 1 件を足す・外す。直前に自分の最新版を取り直し（#478 の規則）、
 * どのリレーからも応答が無ければ発行しない（unreachable）。押した時点の状態（wasPresent）と
 * 取り直した最新版での状態が違えば、既に同じ操作が済んでいるとみなして発行しない（noop）。
 * それ以外は最新版に 1 件だけ足す・外したタグで発行する（未知タグ・content はそのまま）。
 */
async function toggleEId(
  me: string,
  kind: number,
  id: string,
  wasPresent: boolean,
): Promise<"done" | "noop"> {
  let latest: NostrEvent | null;
  try {
    latest = await refetchOwnReplaceable(me, kind);
  } catch (e) {
    if (e instanceof OwnReplaceableUnreachableError)
      throw new OwnListError("unreachable", kind, { cause: e });
    throw e;
  }
  const base = parseEIdList(latest);
  if (base.ids.includes(id) !== wasPresent) return "noop";
  const nextIds = wasPresent ? base.ids.filter((x) => x !== id) : [...base.ids, id];
  const template = buildEIdListTemplate(base, kind, nextIds, unixNow());
  try {
    await publishEvent(template);
  } catch (e) {
    if (e instanceof PublishError) throw new OwnListError(e.reason, kind, { cause: e });
    throw e;
  }
  return "done";
}

/** ブックマークをトグルする（ネイティブ toggleBookmark。押した瞬間の表示に合わせて向きを決める） */
export function toggleBookmark(
  me: string,
  id: string,
  action: "bookmark" | "unbookmark",
): Promise<"done" | "noop"> {
  return toggleEId(me, 10003, id, action === "unbookmark");
}

/** プロフィールへの固定をトグルする（ネイティブ togglePinned。自分の投稿だけ呼ぶ想定） */
export function togglePinned(me: string, id: string, action: "pin" | "unpin"): Promise<"done" | "noop"> {
  return toggleEId(me, 10001, id, action === "unpin");
}
