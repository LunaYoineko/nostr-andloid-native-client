import { act, renderHook } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import type { Subject } from "rxjs";
import { beforeEach, expect, it, vi } from "vitest";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { requestOnceUnstored } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { CONTACTS_OF_CACHE_MAX, CONTACTS_TIMEOUT_MS, useContactsOf } from "./useContactsOf";

// リレーには繋がず、REQ ごとに Subject を返す（イベントはテストから流す）
vi.mock("../../nostr/pool", async () => {
  const { Subject } = await import("rxjs");
  return {
    relays: ["wss://relay.example"],
    requestOnceUnstored: vi.fn(() => new Subject<NostrEvent>()),
  };
});

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

beforeEach(() => {
  vi.mocked(requestOnceUnstored).mockClear();
});

function lastRequest() {
  return vi.mocked(requestOnceUnstored).mock.results.at(-1)?.value as Subject<NostrEvent>;
}

function person() {
  const key = generateSecretKey();
  const pubkey = getPublicKey(key);
  const contacts = (follows: string[], createdAt = 1_000) =>
    finalizeEvent({ kind: 3, created_at: createdAt, tags: follows.map((p) => ["p", p]), content: "" }, key);
  return { pubkey, contacts };
}

it("相手の kind:3 をリレーとインデクサへ 1 件だけ取りに行き、フォローを返す（ストアには入れない）", () => {
  const p = person();
  const { result } = renderHook(() => useContactsOf(p.pubkey));

  expect(result.current).toBeNull();
  expect(vi.mocked(requestOnceUnstored)).toHaveBeenCalledWith(
    ["wss://relay.example", ...INDEXER_RELAYS],
    [{ kinds: [3], authors: [p.pubkey], limit: 1 }],
    CONTACTS_TIMEOUT_MS,
  );
  expect(CONTACTS_TIMEOUT_MS).toBe(6_000);

  act(() => lastRequest().next(p.contacts([A, B])));

  expect(result.current).toEqual([A, B]);
  expect(eventStore.getReplaceable(3, p.pubkey)).toBeUndefined();
});

it("署名が壊れたもの・手元より古いもの・別人のものは無視する", () => {
  const p = person();
  const other = person();
  const { result } = renderHook(() => useContactsOf(p.pubkey));
  const request = lastRequest();

  act(() => request.next(p.contacts([A], 2_000)));
  expect(result.current).toEqual([A]);

  // JSON を通して検証済みの印を落としてから改ざんする
  const tampered: NostrEvent = { ...JSON.parse(JSON.stringify(p.contacts([B], 3_000))), content: "x" };
  act(() => {
    request.next(tampered);
    request.next(p.contacts([C], 1_000));
    request.next(other.contacts([B], 5_000));
  });
  expect(result.current).toEqual([A]);

  act(() => request.next(p.contacts([B, C], 4_000)));
  expect(result.current).toEqual([B, C]);
});

it(`${CONTACTS_OF_CACHE_MAX} 人までは開き直すとすぐ出し、${CONTACTS_OF_CACHE_MAX + 1} 人目を開くと最初の人を忘れる`, () => {
  const people = Array.from({ length: CONTACTS_OF_CACHE_MAX + 1 }, () => person());
  for (const p of people) {
    const { unmount } = renderHook(() => useContactsOf(p.pubkey));
    act(() => lastRequest().next(p.contacts([A])));
    unmount();
  }

  const recent = renderHook(() => useContactsOf(people[CONTACTS_OF_CACHE_MAX].pubkey));
  expect(recent.result.current).toEqual([A]);
  recent.unmount();

  const first = renderHook(() => useContactsOf(people[0].pubkey));
  expect(first.result.current).toBeNull();
});

it("null なら何も取りに行かない", () => {
  const { result } = renderHook(() => useContactsOf(null));
  expect(result.current).toBeNull();
  expect(vi.mocked(requestOnceUnstored)).not.toHaveBeenCalled();
});
