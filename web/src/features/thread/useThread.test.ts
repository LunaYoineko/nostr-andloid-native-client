import { act, renderHook } from "@testing-library/react";
import type { Filter } from "applesauce-core/helpers/filter";
import type { EventPointer } from "applesauce-core/helpers/pointers";
import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import type { Subject } from "rxjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { subscribeTo } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { useThread } from "./useThread";

// リレーには繋がず、REQ ごとに Subject を返す（EOSE はテストから流す）。
// eventLoader が使う pool は本物のまま（テストの WebSocket は接続しない）
vi.mock("../../nostr/pool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../nostr/pool")>();
  const { Subject } = await import("rxjs");
  const relays = ["wss://relay.example"];
  return {
    ...actual,
    useReadRelays: () => relays,
    subscribeTo: vi.fn(() => new Subject<"EOSE">()),
    requestOnce: vi.fn(() => new Subject<NostrEvent>()),
  };
});

const RELAYS = ["wss://relay.example"];

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(subscribeTo).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

type Req = { relays: readonly string[]; filters: Filter[]; subject: Subject<"EOSE"> };

function requests(): Req[] {
  const { calls, results } = vi.mocked(subscribeTo).mock;
  return calls.map(([relays, filters], i) => ({
    relays,
    filters,
    subject: results[i].value as Subject<"EOSE">,
  }));
}

const isEngagement = (r: Req) => r.filters.some((f) => f.kinds?.includes(7));
const replyRequests = () => requests().filter((r) => !isEngagement(r));
const engagementRequests = () => requests().filter(isEngagement);

function signed(tags: string[][] = [], createdAt = 1_000, content = ""): NostrEvent {
  return finalizeEvent({ kind: 1, created_at: createdAt, tags, content }, generateSecretKey());
}

it("起点が未取得なら起点だけで返信と反応を購読する", () => {
  const F = signed().id;
  renderHook(() => useThread({ id: F }));

  expect(vi.mocked(subscribeTo)).toHaveBeenCalledWith(RELAYS, [
    { ids: [F] },
    { kinds: [1, 1111], "#e": [F], limit: 200 },
    { kinds: [1111], "#E": [F], limit: 200 },
  ]);
  expect(vi.mocked(subscribeTo)).toHaveBeenCalledWith(RELAYS, [{ kinds: [7, 6, 16], "#e": [F], limit: 500 }]);
});

it("URL のリレーヒント（wss:// のみ）を返信の購読先に足す", () => {
  const pointer: EventPointer = { id: signed().id, relays: ["wss://hint.example", "http://bad"] };
  renderHook(() => useThread(pointer));

  expect(replyRequests()[0].relays).toEqual(["wss://relay.example", "wss://hint.example"]);
});

it("起点が届いて root が決まったら返信の購読だけを張り直す", () => {
  const R = signed().id;
  const focus = signed([["e", R, "", "root"]]);
  renderHook(() => useThread({ id: focus.id }));
  const [first] = replyRequests();
  expect(first.subject.observed).toBe(true);

  act(() => {
    eventStore.add(focus);
  });

  expect(first.subject.observed).toBe(false);
  expect(replyRequests()).toHaveLength(2);
  expect(replyRequests()[1].filters[0]).toEqual({ ids: [focus.id, R] });
  expect(engagementRequests()).toHaveLength(1);
  expect(engagementRequests()[0].subject.observed).toBe(true);
});

it("起点が届いても root が同じなら張り直さない", () => {
  const focus = signed();
  renderHook(() => useThread({ id: focus.id }));

  act(() => {
    eventStore.add(focus);
  });

  expect(replyRequests()).toHaveLength(1);
});

it("最初の EOSE で読み込み中を消す", () => {
  const pointer = { id: signed().id };
  const { result } = renderHook(() => useThread(pointer));
  expect(result.current.loading).toBe(true);

  act(() => replyRequests()[0].subject.next("EOSE"));

  expect(result.current.loading).toBe(false);
});

it("EOSE が来なくても 8 秒で読み込み中を消す", () => {
  const pointer = { id: signed().id };
  const { result } = renderHook(() => useThread(pointer));

  act(() => vi.advanceTimersByTime(7_999));
  expect(result.current.loading).toBe(true);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.loading).toBe(false);
});

it("root → 起点 → 起点への返信の順に並べ、起点に印を付ける", () => {
  const root = signed([], 1_000, "root");
  const focus = signed([["e", root.id, "", "root"]], 1_001, "focus");
  const reply = signed(
    [
      ["e", root.id, "", "root"],
      ["e", focus.id, "", "reply"],
    ],
    1_002,
    "reply",
  );
  act(() => {
    eventStore.add(reply);
    eventStore.add(root);
    eventStore.add(focus);
  });

  const { result } = renderHook(() => useThread({ id: focus.id }));

  expect(result.current.entries.map((e) => e.event.id)).toEqual([root.id, focus.id, reply.id]);
  expect(result.current.entries.map((e) => e.isFocused)).toEqual([false, true, false]);
  expect(result.current.entries.map((e) => e.depth)).toEqual([0, 1, 2]);
});

it("アンマウントで全購読をやめる", () => {
  const pointer = { id: signed().id };
  const { unmount } = renderHook(() => useThread(pointer));
  const all = requests();
  expect(all).toHaveLength(2);

  unmount();

  for (const r of all) expect(r.subject.observed).toBe(false);
});
