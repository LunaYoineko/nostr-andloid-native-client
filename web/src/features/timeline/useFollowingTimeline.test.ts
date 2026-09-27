import { act, renderHook } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { Subject } from "rxjs";
import { afterEach, expect, it, vi } from "vitest";
import { subscribe } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { useFollowingTimeline } from "./useFollowingTimeline";

// リレーには繋がず、REQ ごとに Subject を返す（EOSE はテストから流す）
vi.mock("../../nostr/pool", async () => {
  const { Subject } = await import("rxjs");
  return { subscribe: vi.fn(() => new Subject<"EOSE">()) };
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(subscribe).mockClear();
});

function lastRequest() {
  const { calls, results } = vi.mocked(subscribe).mock;
  return { filter: calls.at(-1)?.[0], eose: results.at(-1)?.value as Subject<"EOSE"> };
}

function signed(kind: number, key: Uint8Array, tags: string[][] = [], content = "") {
  return finalizeEvent({ kind, created_at: Math.floor(Date.now() / 1000), tags, content }, key);
}

it("kind:3 が無い間はリレー新着、届いたらフォロー + 自分で購読し直し、フォローの投稿だけを出す", () => {
  const meKey = generateSecretKey();
  const me = getPublicKey(meKey);
  const followKey = generateSecretKey();
  const follow = getPublicKey(followKey);

  const { result } = renderHook(() => useFollowingTimeline(me));

  expect(result.current.mode).toBe("global");
  expect(vi.mocked(subscribe)).toHaveBeenCalledWith({ kinds: [3], authors: [me] });
  expect(lastRequest().filter).toEqual({ kinds: [1], limit: 100 });

  act(() => {
    eventStore.add(signed(3, meKey, [["p", follow]]));
  });

  expect(result.current.mode).toBe("following");
  expect(lastRequest().filter).toEqual({ kinds: [1, 6, 16, 5, 1111], authors: [follow, me], limit: 100 });

  const followed = signed(1, followKey, [], "フォロー先の投稿");
  act(() => {
    eventStore.add(followed);
    eventStore.add(signed(1, generateSecretKey(), [], "知らない人の投稿"));
  });
  expect(result.current.events).toEqual([followed]);
});

it("最初の EOSE で、EOSE が来なくても 8 秒で読み込み中を消す", () => {
  vi.useFakeTimers();
  const me = getPublicKey(generateSecretKey());

  const first = renderHook(() => useFollowingTimeline(me));
  expect(first.result.current.loading).toBe(true);
  act(() => lastRequest().eose.next("EOSE"));
  expect(first.result.current.loading).toBe(false);
  first.unmount();

  const second = renderHook(() => useFollowingTimeline(me));
  act(() => vi.advanceTimersByTime(7_999));
  expect(second.result.current.loading).toBe(true);
  act(() => vi.advanceTimersByTime(1));
  expect(second.result.current.loading).toBe(false);
});
