import { getPublicContacts } from "applesauce-core/helpers/contacts";
import type { Filter } from "applesauce-core/helpers/filter";
import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { useEffect, useMemo, useState } from "react";
import { map } from "rxjs";
import { subscribe } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";

/** following = 自分のフォロー + 自分、global = kind:3 が空/未取得の間のリレー新着 */
export type TimelineMode = "following" | "global";

export type FollowingTimeline = {
  mode: TimelineMode;
  /** 最初の EOSE（または 8 秒経過）まで true */
  loading: boolean;
  /** 新しい順 */
  events: NostrEvent[];
};

// kind:1 本文 + kind:6/16 リポスト + kind:5 削除 + kind:1111 コメント（ネイティブの subscribeFollowing と同じ）
const FOLLOWING_KINDS = [1, 6, 16, 5, 1111];
// kind:5 は EventStore が削除として処理するので表示の対象から外す
const DISPLAY_KINDS = [1, 6, 16, 1111];
const LIMIT = 100;
// EOSE を返さない/遅いリレーだけでも「読み込み中」を出し続けない（ネイティブと同じ 8 秒）
const LOADING_TIMEOUT_MS = 8_000;
const NO_EVENTS: NostrEvent[] = [];

/**
 * ホームのタイムライン。自分の kind:3 を購読し、フォロー（+ 自分）の投稿を流す。
 * kind:3 が空または未取得の間はリレーの kind:1 新着を出す。
 */
export function useFollowingTimeline(me: string): FollowingTimeline {
  // 自分のフォローリスト。購読したままにしてフォローの更新にも追従する
  useEffect(() => {
    const sub = subscribe({ kinds: [3], authors: [me] }).subscribe();
    return () => sub.unsubscribe();
  }, [me]);
  const follows = use$(
    () =>
      eventStore
        .timeline({ kinds: [3], authors: [me] })
        .pipe(map(([latest]) => (latest ? getPublicContacts(latest).map((p) => p.pubkey) : []))),
    [me],
  );

  // フォローの中身が変わったときだけ REQ を張り直す（kind:3 の再受信で配列が作り直されても同じなら据え置く）
  const followKey = follows?.join(",") ?? "";
  const { mode, request, view } = useMemo(() => {
    if (followKey === "") {
      return {
        mode: "global" as const,
        request: { kinds: [1], limit: LIMIT } satisfies Filter,
        view: { kinds: [1] } satisfies Filter,
      };
    }
    const authors = [...new Set([...followKey.split(","), me])];
    return {
      mode: "following" as const,
      request: { kinds: FOLLOWING_KINDS, authors, limit: LIMIT } satisfies Filter,
      view: { kinds: DISPLAY_KINDS, authors } satisfies Filter,
    };
  }, [followKey, me]);

  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const done = () => setLoading(false);
    const timer = setTimeout(done, LOADING_TIMEOUT_MS);
    const sub = subscribe(request).subscribe(done);
    return () => {
      clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [request]);

  const events = use$(() => eventStore.timeline(view), [view]);
  return { mode, loading, events: events ?? NO_EVENTS };
}
