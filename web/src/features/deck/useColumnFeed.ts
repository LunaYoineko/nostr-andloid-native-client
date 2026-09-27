import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { map, type Subscription } from "rxjs";
import {
  type Ctx,
  LOADING_TIMEOUT_MS,
  OLDER_TIMEOUT_MS,
  outboxAuthorsFor,
  requestFor,
  viewFor,
} from "../../lib/columnRequest";
import { type ColumnSpec, encodeReqFilter } from "../../lib/columns";
import { authorOutbox$ } from "../../nostr/outbox";
import { relays, requestOnce, subscribeTo } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { useFollows } from "./useFollows";

/** following = フォロー + 自分、global = フォローが空/未取得の間のリレー新着、column = フォロー中以外のカラム */
export type FeedMode = "following" | "global" | "column";

export type ColumnFeed = {
  mode: FeedMode;
  /** 最初の EOSE（または 8 秒経過）まで true */
  loading: boolean;
  /** 新しい順 */
  events: NostrEvent[];
  /** 過去読みの最中 */
  loadingOlder: boolean;
  /** いま出ている最古より古いものを 1 回だけ取りに行く */
  loadOlder(): void;
  /** REQ を張り直す */
  refresh(): void;
};

const NO_EVENTS: NostrEvent[] = [];

/**
 * 1 カラムの購読と表示。カラムの REQ を張ったままにし（アンマウントで CLOSE）、EventStore から条件に合う投稿を読む。
 */
export function useColumnFeed(spec: ColumnSpec): ColumnFeed {
  const me = useSession((s) => s.pubkey);
  // フック呼び出しの順を変えないよう常に呼ぶ（フォロー中以外は me を渡さず購読しない）
  const follows = useFollows(spec.kind === "FOLLOWING" ? me : null);

  // フィルター・フォローの中身が変わったときだけ張り直す（同じ中身で配列が作り直されても据え置く）
  const filterKey = encodeReqFilter(spec.filter);
  const followKey = follows?.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: spec と follows は中身のキー（id・filterKey・followKey）で比べる
  const { plan, view } = useMemo(() => {
    const ctx: Ctx = { me, follows, relays };
    return { plan: requestFor(spec, ctx), view: viewFor(spec, ctx) };
  }, [spec.id, filterKey, me, followKey]);

  // 著者 1〜3 人のカラムは、その人たちの書き込みリレーへも張る（アウトボックス購読）
  const outboxKey = outboxAuthorsFor(spec)?.join(",") ?? "";

  const [epoch, setEpoch] = useState(0);
  const [loading, setLoading] = useState(plan !== null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: epoch は refresh() で張り直すためのキー
  useEffect(() => {
    if (plan === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const done = () => setLoading(false);
    const timer = setTimeout(done, LOADING_TIMEOUT_MS);
    const sub = subscribeTo(plan.relays, plan.filters).subscribe(done);
    const outbox = outboxKey !== "" ? authorOutbox$(outboxKey.split(","), plan.filters).subscribe() : null;
    return () => {
      clearTimeout(timer);
      sub.unsubscribe();
      outbox?.unsubscribe();
    };
  }, [plan, epoch, outboxKey]);

  const events =
    use$(
      () =>
        eventStore
          .timeline(view.filters)
          .pipe(map((list) => (view.predicate ? list.filter(view.predicate) : list))),
      [view],
    ) ?? NO_EVENTS;

  const [loadingOlder, setLoadingOlder] = useState(false);
  const older = useRef<{ oldest: number | null; sub: Subscription | null }>({ oldest: null, sub: null });
  useEffect(() => () => older.current.sub?.unsubscribe(), []);

  const loadOlder = useCallback(() => {
    const oldest = events.at(-1)?.created_at;
    const state = older.current;
    if (oldest === undefined || oldest === state.oldest || state.sub !== null || plan === null) return;
    state.oldest = oldest;
    setLoadingOlder(true);
    const finish = () => {
      state.sub = null;
      setLoadingOlder(false);
    };
    const filters = plan.filters.map((f) => ({ ...f, until: oldest }));
    const sub = requestOnce(plan.relays, filters, OLDER_TIMEOUT_MS).subscribe({
      complete: finish,
      error: finish,
    });
    // 同期的に終わった場合は finish 済みなので控えない
    if (!sub.closed) state.sub = sub;
  }, [events, plan]);

  const refresh = useCallback(() => setEpoch((e) => e + 1), []);

  const mode: FeedMode =
    spec.kind !== "FOLLOWING" ? "column" : follows && follows.length > 0 ? "following" : "global";
  return { mode, loading, events, loadingOlder, loadOlder, refresh };
}
