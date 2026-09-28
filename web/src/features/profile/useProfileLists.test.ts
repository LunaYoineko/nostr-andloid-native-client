import { act, renderHook } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import type { Subject } from "rxjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { INDEXER_RELAYS, LOADING_TIMEOUT_MS } from "../../lib/columnRequest";
import { requestOnce } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { useProfileLists } from "./useProfileLists";

// リレーには繋がず、REQ ごとに Subject を返す（EOSE・完了はテストから流す）
vi.mock("../../nostr/pool", async () => {
  const { Subject } = await import("rxjs");
  // 実物の useReadRelays（zustand セレクタ）は変わらない限り同じ配列を返す。テストでも同じ参照を返す
  const relays = ["wss://relay.example"];
  return {
    useReadRelays: () => relays,
    requestOnce: vi.fn(() => new Subject<NostrEvent>()),
  };
});

let key: Uint8Array;
let pubkey: string;

beforeEach(() => {
  key = generateSecretKey();
  pubkey = getPublicKey(key);
  vi.mocked(requestOnce).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function last() {
  return vi.mocked(requestOnce).mock.results.at(-1)?.value as Subject<NostrEvent>;
}

function followSet(signer: Uint8Array, d: string, members: string[], at = 100) {
  return finalizeEvent(
    { kind: 30000, created_at: at, content: "", tags: [["d", d], ...members.map((p) => ["p", p])] },
    signer,
  );
}

it("開くと自分のリレー + インデクサへ kind:30000/30003 を authors で 1 度だけ取りに行く", () => {
  const { result } = renderHook(() => useProfileLists(pubkey));
  expect(result.current).toEqual({ loading: true, sets: [] });
  expect(vi.mocked(requestOnce)).toHaveBeenCalledWith(
    ["wss://relay.example", ...INDEXER_RELAYS],
    [{ kinds: [30000, 30003], authors: [pubkey] }],
    LOADING_TIMEOUT_MS,
  );
});

it("完了（EOSE）すると読み込み中を消す", () => {
  const { result } = renderHook(() => useProfileLists(pubkey));
  expect(result.current.loading).toBe(true);
  act(() => last().complete());
  expect(result.current.loading).toBe(false);
});

it("届いた kind:30000/30003 を解析して返す（EventStore 経由）", () => {
  const { result } = renderHook(() => useProfileLists(pubkey));
  act(() => {
    eventStore.add(followSet(key, "friends", ["pk1", "pk2"]));
    last().complete();
  });
  expect(result.current.sets).toHaveLength(1);
  expect(result.current.sets[0].title).toBe("friends");
  expect(result.current.sets[0].members).toEqual(["pk1", "pk2"]);
});

it("閉じると REQ をやめる", () => {
  const { unmount } = renderHook(() => useProfileLists(pubkey));
  const sub = last();
  expect(sub.observed).toBe(true);
  unmount();
  expect(sub.observed).toBe(false);
});
