import { act, renderHook } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import type { Subject } from "rxjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildColumn, type ColumnSpec, DEFAULT_COLUMNS } from "../../lib/columns";
import { authorOutbox$ } from "../../nostr/outbox";
import { requestOnce, subscribe, subscribeTo } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { useDeck } from "../../store/deck";
import { EMPTY_MUTE_LIST, setMuteList } from "../mute/muteList";
import { useColumnFeed } from "./useColumnFeed";

// リレーには繋がず、REQ ごとに Subject を返す（EOSE・過去読みの完了はテストから流す）
vi.mock("../../nostr/pool", async () => {
  const { Subject } = await import("rxjs");
  const relays = ["wss://relay.example"];
  return {
    useReadRelays: () => relays,
    subscribe: vi.fn(() => new Subject<"EOSE">()),
    subscribeTo: vi.fn(() => new Subject<"EOSE">()),
    requestOnce: vi.fn(() => new Subject<NostrEvent>()),
  };
});

// アウトボックス購読も Subject にして、張った / やめたを observed で見る
vi.mock("../../nostr/outbox", async () => {
  const { Subject } = await import("rxjs");
  return { authorOutbox$: vi.fn(() => new Subject<"EOSE">()) };
});

const RELAYS = ["wss://relay.example"];
const [FOLLOWING, HASHTAG, NOTIFICATIONS] = DEFAULT_COLUMNS;

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
  vi.mocked(authorOutbox$).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  setMuteList(null);
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

it("著者指定のカラム: 著者の書き込みリレーへも張り、refresh で張り直し、アンマウントでやめる", () => {
  const author = getPublicKey(generateSecretKey());
  const profile = buildColumn("PROFILE", { text: author }, new Set(), 1);
  if (!profile) throw new Error("buildColumn returned null");
  const outbox = () => vi.mocked(authorOutbox$).mock.results.at(-1)?.value as Subject<"EOSE">;

  const { result, unmount } = renderHook(() => useColumnFeed(profile));
  expect(vi.mocked(authorOutbox$)).toHaveBeenCalledWith(
    [author],
    [{ kinds: [1], authors: [author], limit: 100 }],
  );
  const first = outbox();
  expect(first.observed).toBe(true);

  act(() => result.current.refresh());
  expect(first.observed).toBe(false);
  expect(vi.mocked(authorOutbox$)).toHaveBeenCalledTimes(2);
  expect(outbox()).not.toBe(first);
  expect(outbox().observed).toBe(true);

  const second = outbox();
  unmount();
  expect(second.observed).toBe(false);
});

it("ハッシュタグのカラムはアウトボックス購読をしない", () => {
  renderHook(() => useColumnFeed(HASHTAG));
  expect(vi.mocked(authorOutbox$)).not.toHaveBeenCalled();
});

it("ミュート: 対象を除き（自分の投稿は除かない）、カラムで「ミュートを表示」中は除かない", () => {
  const tag = `mute${Date.now()}`;
  const spec: ColumnSpec = { ...HASHTAG, id: "c_mute", filter: { ...HASHTAG.filter, hashtags: [tag] } };
  const mutedKey = generateSecretKey();
  const shown = signed(1, generateSecretKey(), [["t", tag]], "ok", 3_000);
  const byMuted = signed(1, mutedKey, [["t", tag]], "muted user", 2_500);
  const spam = signed(1, generateSecretKey(), [["t", tag]], "SPAM", 2_000);
  const mine = signed(1, meKey, [["t", tag]], "my spam", 1_000);
  act(() => {
    for (const e of [shown, byMuted, spam, mine]) eventStore.add(e);
    setMuteList({
      ...EMPTY_MUTE_LIST,
      entries: [
        { category: "p", value: getPublicKey(mutedKey), isPublic: true, isPrivate: false },
        { category: "word", value: "spam", isPublic: false, isPrivate: true },
      ],
    });
  });

  const { result } = renderHook(() => useColumnFeed(spec));
  expect(result.current.events).toEqual([shown, mine]);

  act(() => useDeck.getState().setRevealMuted(spec.id, true));
  expect(result.current.events).toEqual([shown, byMuted, spam, mine]);

  act(() => useDeck.getState().setRevealMuted(spec.id, false));
  expect(result.current.events).toEqual([shown, mine]);
});

it("ミュート: 通知は相手で判定する（本文のワードでは隠さない）", () => {
  const mutedKey = generateSecretKey();
  const fromMuted = signed(1, mutedKey, [["p", me]], "hello", 2_000);
  const withWord = signed(1, generateSecretKey(), [["p", me]], "spam reply", 1_000);
  act(() => {
    eventStore.add(fromMuted);
    eventStore.add(withWord);
    setMuteList({
      ...EMPTY_MUTE_LIST,
      entries: [
        { category: "p", value: getPublicKey(mutedKey), isPublic: true, isPrivate: false },
        { category: "word", value: "spam", isPublic: true, isPrivate: false },
      ],
    });
  });

  const { result } = renderHook(() => useColumnFeed(NOTIFICATIONS));
  expect(result.current.events).toEqual([withWord]);
});
