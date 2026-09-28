import type { Filter } from "applesauce-core/helpers/filter";
import { type NostrEvent, verifyEvent } from "nostr-tools/pure";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  catchError,
  defer,
  EMPTY,
  endWith,
  ignoreElements,
  map,
  type Observable,
  Subscription,
  tap,
} from "rxjs";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { requestOnceUnstored } from "../../nostr/pool";

/** 1 ページで取る kind:3 の件数（ネイティブ fetchFollowersPage の pageSize） */
export const FOLLOWERS_PAGE_SIZE = 100;
/** 1 ページの REQ を張っておく時間（ネイティブと同じ 2.5 秒。全リレーの EOSE が先ならそこで終わる） */
export const FOLLOWERS_WAIT_MS = 2_500;

export type FollowersPage = { followers: string[]; hasMore: boolean };

/**
 * フォロワー集計の累積（対象 1 人分。ネイティブ followerAccum）。発行者ごとに最新の kind:3 の created_at と
 * 「対象を含むか」だけを持つ（kind:3 の本体は持たない）。
 */
export class FollowerScan {
  readonly target: string;
  private readonly seen = new Map<string, { createdAt: number; follows: boolean }>();

  constructor(target: string) {
    this.target = target;
  }

  /** 見えた発行者の数（含まないと分かった人も数える） */
  get size(): number {
    return this.seen.size;
  }

  /** kind:3 を 1 件記録する。同じ発行者は新しい版だけで上書きする */
  record(event: NostrEvent): void {
    if (event.kind !== 3) return;
    const prev = this.seen.get(event.pubkey);
    if (prev && prev.createdAt >= event.created_at) return;
    this.seen.set(event.pubkey, {
      createdAt: event.created_at,
      follows: event.tags.some((t) => t[0] === "p" && t[1] === this.target),
    });
  }

  /** 最新の kind:3 に対象を含む発行者（見えた順） */
  followers(): string[] {
    return [...this.seen].filter(([, v]) => v.follows).map(([pubkey]) => pubkey);
  }

  /** 続きの until（見えた created_at の最小 − 1）。まだ何も見えていなければ undefined */
  cursor(): number | undefined {
    let min: number | undefined;
    for (const { createdAt } of this.seen.values()) {
      if (min === undefined || createdAt < min) min = createdAt;
    }
    return min === undefined ? undefined : min - 1;
  }
}

/** 1 ページ分の REQ（インデクサだけへ。2 ページ目からは until を付ける） */
export function followersFilter(scan: FollowerScan): Filter {
  const filter: Filter = { kinds: [3], "#p": [scan.target], limit: FOLLOWERS_PAGE_SIZE };
  const until = scan.cursor();
  if (until !== undefined) filter.until = until;
  return filter;
}

/**
 * フォロワーを 1 ページ分集める（ネイティブ fetchFollowersPage）。INDEXER_RELAYS だけへ kind:3 の #p を投げ、
 * 終わったら（EOSE か FOLLOWERS_WAIT_MS）scan の累積を 1 度だけ流す。hasMore = 見えた発行者が増えた。
 * 受けた kind:3 は署名を検証して scan に記録するだけで、EventStore にもキャッシュにも入れない（巨大なので）。
 */
export function followersPage$(scan: FollowerScan): Observable<FollowersPage> {
  return defer(() => {
    const before = scan.size;
    return requestOnceUnstored(INDEXER_RELAYS, [followersFilter(scan)], FOLLOWERS_WAIT_MS).pipe(
      tap((event) => {
        if (event.kind === 3 && verifyEvent(event)) scan.record(event);
      }),
      ignoreElements(),
      // どこからも届かなくても、それまでの分で終える
      catchError(() => EMPTY),
      endWith(null),
      map(() => ({ followers: scan.followers(), hasMore: scan.size > before })),
    );
  });
}

export type FollowersState = {
  /** null = まだ集計していない（最初のページの取得中を含む） */
  followers: string[] | null;
  hasMore: boolean;
  loading: boolean;
};

/**
 * プロフィールのフォロワー（kind:3 の逆引き）。自動では取らず、start() / loadMore() を呼んだときだけ REQ を投げる
 * （ネイティブの「フォロワーを確認」）。start() は未集計のときだけ最初のページを取る。閉じたら REQ を CLOSE する。
 */
export function useFollowers(pubkey: string): FollowersState & { start(): void; loadMore(): void } {
  const [state, setState] = useState<FollowersState>({ followers: null, hasMore: false, loading: false });
  const scan = useRef<FollowerScan | null>(null);
  const request = useRef<Subscription | null>(null);

  useEffect(
    () => () => {
      request.current?.unsubscribe();
      request.current = null;
    },
    [],
  );

  const fetchPage = useCallback(
    (reset: boolean) => {
      if (request.current) return;
      if (reset || scan.current?.target !== pubkey) scan.current = new FollowerScan(pubkey);
      const current = scan.current;
      const sub = new Subscription();
      request.current = sub;
      setState((s) => ({ ...s, loading: true }));
      sub.add(
        followersPage$(current).subscribe((page) => {
          if (request.current !== sub) return;
          request.current = null;
          setState({ followers: page.followers, hasMore: page.hasMore, loading: false });
        }),
      );
    },
    [pubkey],
  );

  const start = useCallback(() => {
    if (state.followers === null && !state.loading) fetchPage(true);
  }, [state.followers, state.loading, fetchPage]);
  const loadMore = useCallback(() => {
    if (!state.loading) fetchPage(false);
  }, [state.loading, fetchPage]);

  return { ...state, start, loadMore };
}
