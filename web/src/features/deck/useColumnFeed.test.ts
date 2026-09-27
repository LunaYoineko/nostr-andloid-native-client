import { act, renderHook } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import type { Subject } from "rxjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type ColumnSpec, DEFAULT_COLUMNS } from "../../lib/columns";
import { requestOnce, subscribe, subscribeTo } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { useColumnFeed } from "./useColumnFeed";

// リレーには繋がず、REQ ごとに Subject を返す（EOSE・過去読みの完了はテストから流す）
vi.mock("../../nostr/pool", async () => {
  const { Subject } = await import("rxjs");
  return {
    relays: ["wss://relay.example"],
    subscribe: vi.fn(() => new Subject<"EOSE">()),
    subscribeTo: vi.fn(() => new Subject<"EOSE">()),
    requestOnce: vi.fn(() => new Subject<NostrEvent>()),
  };
});

const RELAYS = ["wss://relay.example"];
const [FOLLOWING, HASHTAG] = DEFAULT_COLUMNS;

let meKey: Uint8Array;
let me: string;

beforeEach(() => {
  meKey = generateSecretKey();
  me = getPublicKey(meKey);
  useSession.setState({ status: "in", method: "nip07", pubkey: me });
  // 前のテストの描画は afterEach の後で片付くので、呼び出しの記録は始めに消す
  vi.mocked(subscribe).mockClear();
  vi.mocked(subscribeTo).mockClear();
  vi.mocked(requestOnce).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function lastRequest() {
  const { calls, results } = vi.mocked(subscribeTo).mock;
  const call = calls.at(-1);
  return { relays: call?.[0], filters: call?.[1], eose: results.at(-1)?.value as Subject<"EOSE"> };
}

function signed(kind: number, key: Uint8Array, tags: string[][] = [], content = "", createdAt?: number) {
  return finalizeEvent({ kind, created_at: createdAt ?? Math.floor(Date.now() / 1000), tags, content }, key);
}

it("フォロー中: kind:3 が無い間はリレー新着、届いたらフォロー + 自分で購読し直し、フォローの投稿だけを出す", () => {
  const followKey = generateSecretKey();
  const follow = getPublicKey(followKey);

  const { result } = renderHook(() => useColumnFeed(FOLLOWING));

  expect(result.current.mode).toBe("global");
  expect(vi.mocked(subscribe)).toHaveBeenCalledWith({ kinds: [3], authors: [me] });
  expect(lastRequest().relays).toEqual(RELAYS);
  expect(lastRequest().filters).toEqual([{ kinds: [1], limit: 100 }]);

  act(() => {
    eventStore.add(signed(3, meKey, [["p", follow]]));
  });

  expect(result.current.mode).toBe("following");
  expect(lastRequest().filters).toEqual([{ kinds: [1, 6, 16, 5, 1111], authors: [follow, me], limit: 100 }]);

  const followed = signed(1, followKey, [], "フォロー先の投稿");
  act(() => {
    eventStore.add(followed);
    eventStore.add(signed(1, generateSecretKey(), [], "知らない人の投稿"));
  });
  expect(result.current.events).toEqual([followed]);
});

it("最初の EOSE で、EOSE が来なくても 8 秒で読み込み中を消す", () => {
  vi.useFakeTimers();

  const first = renderHook(() => useColumnFeed(FOLLOWING));
  expect(first.result.current.loading).toBe(true);
  act(() => lastRequest().eose.next("EOSE"));
  expect(first.result.current.loading).toBe(false);
  first.unmount();

  const second = renderHook(() => useColumnFeed(FOLLOWING));
  act(() => vi.advanceTimersByTime(7_999));
  expect(second.result.current.loading).toBe(true);
  act(() => vi.advanceTimersByTime(1));
  expect(second.result.current.loading).toBe(false);
});

it("ハッシュタグ: 設定リレーへ #t の REQ を張り、kind:3 は購読しない", () => {
  const { result } = renderHook(() => useColumnFeed(HASHTAG));
  expect(result.current.mode).toBe("column");
  expect(vi.mocked(subscribeTo)).toHaveBeenCalledWith(RELAYS, [{ kinds: [1], "#t": ["nostr"], limit: 100 }]);
  expect(vi.mocked(subscribe)).not.toHaveBeenCalled();
});

it("loadOlder: 最古の created_at を until にして 1 回だけ取りに行き、同じ最古では繰り返さない", () => {
  const tag = `older${Date.now()}`;
  const spec: ColumnSpec = { ...HASHTAG, id: "c_older", filter: { ...HASHTAG.filter, hashtags: [tag] } };
  const key = generateSecretKey();
  act(() => {
    eventStore.add(signed(1, key, [["t", tag]], "new", 2_000));
    eventStore.add(signed(1, key, [["t", tag]], "old", 1_000));
  });
  const { result } = renderHook(() => useColumnFeed(spec));
  expect(result.current.events).toHaveLength(2);

  act(() => result.current.loadOlder());
  expect(vi.mocked(requestOnce)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(requestOnce)).toHaveBeenCalledWith(
    RELAYS,
    [{ kinds: [1], "#t": [tag], limit: 100, until: 1_000 }],
    6_000,
  );
  expect(result.current.loadingOlder).toBe(true);

  const older = vi.mocked(requestOnce).mock.results[0].value as Subject<NostrEvent>;
  act(() => older.complete());
  expect(result.current.loadingOlder).toBe(false);

  act(() => result.current.loadOlder());
  expect(vi.mocked(requestOnce)).toHaveBeenCalledTimes(1);
});

it("refresh: 前の購読をやめて REQ を張り直す", () => {
  const { result } = renderHook(() => useColumnFeed(HASHTAG));
  const before = lastRequest().eose;
  act(() => before.next("EOSE"));
  expect(result.current.loading).toBe(false);
  expect(before.observed).toBe(true);

  act(() => result.current.refresh());
  expect(before.observed).toBe(false);
  expect(vi.mocked(subscribeTo)).toHaveBeenCalledTimes(2);
  expect(lastRequest().eose).not.toBe(before);
  expect(lastRequest().eose.observed).toBe(true);
  expect(result.current.loading).toBe(true);
});

it("DM カラムは購読せず、読み込み中にもしない", () => {
  const dm: ColumnSpec = { ...HASHTAG, id: "c_dm", kind: "DM", filter: { ...HASHTAG.filter, kinds: [14] } };
  const { result } = renderHook(() => useColumnFeed(dm));
  expect(vi.mocked(subscribeTo)).not.toHaveBeenCalled();
  expect(result.current.loading).toBe(false);
});
