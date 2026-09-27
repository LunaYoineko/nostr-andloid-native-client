import { act, renderHook } from "@testing-library/react";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import type { Subject } from "rxjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SEARCH_RELAYS } from "../../lib/columnRequest";
import { subscribeTo } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { useUserSearch } from "./searchUsers";

// リレーには繋がず、REQ ごとに Subject を返す（EOSE はテストから流す）
vi.mock("../../nostr/pool", async () => {
  const { Subject } = await import("rxjs");
  return {
    relays: ["wss://relay.example"],
    subscribeTo: vi.fn(() => new Subject<"EOSE">()),
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(subscribeTo).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function lastReq(): Subject<"EOSE"> {
  return vi.mocked(subscribeTo).mock.results.at(-1)?.value as Subject<"EOSE">;
}

it("検索リレーへ kind:0 の NIP-50 検索を張り、最初の EOSE で読み込み中を消す", () => {
  const { result } = renderHook(() => useUserSearch("alice"));
  expect(vi.mocked(subscribeTo)).toHaveBeenCalledWith(SEARCH_RELAYS, [
    { kinds: [0], search: "alice", limit: 100 },
  ]);
  expect(result.current.loading).toBe(true);
  act(() => lastReq().next("EOSE"));
  expect(result.current.loading).toBe(false);
});

it("EOSE が来なくても 8 秒で読み込み中を消す", () => {
  const { result } = renderHook(() => useUserSearch("alice"));
  act(() => vi.advanceTimersByTime(7_999));
  expect(result.current.loading).toBe(true);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.loading).toBe(false);
});

it("語が変わると前の購読をやめて張り直し、アンマウントでやめる", () => {
  const { rerender, unmount } = renderHook(({ q }) => useUserSearch(q), { initialProps: { q: "alice" } });
  const first = lastReq();
  expect(first.observed).toBe(true);

  rerender({ q: "bob" });
  expect(first.observed).toBe(false);
  expect(vi.mocked(subscribeTo)).toHaveBeenLastCalledWith(SEARCH_RELAYS, [
    { kinds: [0], search: "bob", limit: 100 },
  ]);
  const second = lastReq();
  expect(second.observed).toBe(true);

  unmount();
  expect(second.observed).toBe(false);
});

it("語が空なら張らず、読み込み中にしない", () => {
  const { result } = renderHook(() => useUserSearch(""));
  expect(vi.mocked(subscribeTo)).not.toHaveBeenCalled();
  expect(result.current.loading).toBe(false);
  expect(result.current.users).toEqual([]);
});

it("ストアに kind:0 が届くと 300ms 以内に結果に出る", () => {
  const name = `zed${Date.now()}`;
  const { result } = renderHook(() => useUserSearch(name));
  expect(result.current.users).toEqual([]);

  const event = finalizeEvent(
    { kind: 0, created_at: 1, tags: [], content: JSON.stringify({ name }) },
    generateSecretKey(),
  );
  act(() => {
    eventStore.add(event);
  });
  act(() => vi.advanceTimersByTime(300));
  expect(result.current.users.map((u) => u.pubkey)).toEqual([event.pubkey]);
});
