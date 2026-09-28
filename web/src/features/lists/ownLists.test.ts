import { act, renderHook } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, Observable, Subject, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWN_REPLACEABLE_REFETCH_MS } from "../../nostr/ownReplaceable";
import { requestOnce, subscribe } from "../../nostr/pool";
import { type EventDraft, PublishError, publishEvent } from "../../nostr/publish";
import { addVerified } from "../../nostr/store";
import { useSession } from "../../signer/session";
import {
  OwnListError,
  startOwnLists,
  toggleBookmark,
  togglePinned,
  useBookmarkedIds,
  useIsBookmarked,
  useIsPinned,
  useOwnLists,
} from "./ownLists";

// リレーには繋がない（取り直し・購読はテストごとに差し替える）
vi.mock("../../nostr/pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/pool")>()),
  requestOnce: vi.fn(),
  subscribe: vi.fn(),
}));

// 署名・送信はしない（送信キューの入口だけ差し替える）
vi.mock("../../nostr/publish", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/publish")>()),
  publishEvent: vi.fn(async () => ({})),
}));

let key: Uint8Array;
let me: string;

beforeEach(() => {
  // テストごとに新しい鍵（同じ pubkey の kind:10003/10001 を使い回すと EventStore に前のテストの版が残る）
  key = generateSecretKey();
  me = getPublicKey(key);
  vi.mocked(requestOnce).mockReset();
  vi.mocked(subscribe).mockReset();
  vi.mocked(publishEvent).mockClear();
  useOwnLists.setState({ bookmarks: null, pinned: null });
});

afterEach(() => {
  useOwnLists.setState({ bookmarks: null, pinned: null });
});

function eidList(
  kind: number,
  ids: string[],
  createdAt: number,
  otherTags: string[][] = [],
  content = "",
): NostrEvent {
  return finalizeEvent(
    { kind, created_at: createdAt, tags: [...ids.map((id) => ["e", id]), ...otherTags], content },
    key,
  );
}

/** 取り直しで latest が届く（リレーは応答する） */
function refetchReturns(latest: NostrEvent | null) {
  vi.mocked(requestOnce).mockImplementation(() =>
    latest
      ? new Observable<NostrEvent>((subscriber) => {
          addVerified(latest, "wss://relay.example");
          subscriber.next(latest);
          subscriber.complete();
        })
      : EMPTY,
  );
}

function published(): EventDraft {
  const calls = vi.mocked(publishEvent).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0][0];
}

describe("トグル（データ保護。#478）", () => {
  it("取り直しでどのリレーからも応答が無ければ発行しない（unreachable）", async () => {
    vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));

    const error = await toggleBookmark(me, "note1", "bookmark").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OwnListError);
    expect(error).toMatchObject({ reason: "unreachable", kind: 10003 });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
    expect(vi.mocked(requestOnce)).toHaveBeenCalledWith(
      expect.any(Array),
      [{ kinds: [10003], authors: [me], limit: 1 }],
      OWN_REPLACEABLE_REFETCH_MS,
    );
  });

  it("最新版で既に同じ状態（別の端末で同じ操作が済んでいる）なら発行しない（noop）", async () => {
    refetchReturns(eidList(10003, ["note1"], 1_000));
    expect(await toggleBookmark(me, "note1", "bookmark")).toBe("noop");

    refetchReturns(eidList(10001, [], 1_000));
    expect(await togglePinned(me, "note2", "unpin")).toBe("noop");

    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("それ以外は最新版に 1 件だけ足したタグで発行し、未知タグと content を保つ", async () => {
    const latest = eidList(10003, ["note1"], 2_000, [["t", "nostr"]], "encrypted-private-part");
    refetchReturns(latest);

    expect(await toggleBookmark(me, "note2", "bookmark")).toBe("done");

    const draft = published();
    expect(draft.kind).toBe(10003);
    expect(draft.tags).toEqual([
      ["e", "note1"],
      ["e", "note2"],
      ["t", "nostr"],
    ]);
    expect(draft.content).toBe("encrypted-private-part");
    expect(draft.created_at).toBeGreaterThan(2_000);
  });

  it("それ以外は最新版から 1 件だけ外したタグで発行する（固定投稿）", async () => {
    const latest = eidList(10001, ["note1", "note2"], 2_000);
    refetchReturns(latest);

    expect(await togglePinned(me, "note1", "unpin")).toBe("done");

    const draft = published();
    expect(draft.kind).toBe(10001);
    expect(draft.tags).toEqual([["e", "note2"]]);
  });

  it("署名の失敗は同じ reason の OwnListError", async () => {
    refetchReturns(null);
    vi.mocked(publishEvent).mockRejectedValueOnce(new PublishError("sign-failed"));
    await expect(toggleBookmark(me, "note1", "bookmark")).rejects.toMatchObject({
      name: "OwnListError",
      reason: "sign-failed",
    });
  });
});

describe("startOwnLists（読む）", () => {
  it("自分の kind:10003 / 10001 を購読し、e タグの id をストアへ入れる。EOSE までに無ければ空のリスト", async () => {
    useSession.setState({ status: "in", method: "local", pubkey: me });
    const subjects: Subject<"EOSE">[] = [];
    vi.mocked(subscribe).mockImplementation(() => {
      const s = new Subject<"EOSE">();
      subjects.push(s);
      return s;
    });

    const stop = startOwnLists();
    const calls = vi.mocked(subscribe).mock.calls.map((c) => c[0]);
    const bookmarkSettleIdx = calls.findIndex(
      (f) => !Array.isArray(f) && "kinds" in f && f.kinds?.[0] === 10003,
    );
    const pinnedSettleIdx = calls.findIndex(
      (f) => !Array.isArray(f) && "kinds" in f && f.kinds?.[0] === 10001,
    );
    expect(bookmarkSettleIdx).toBeGreaterThanOrEqual(0);
    expect(pinnedSettleIdx).toBeGreaterThanOrEqual(0);

    expect(useOwnLists.getState().bookmarks).toBeNull();
    subjects[bookmarkSettleIdx].next("EOSE");
    subjects[pinnedSettleIdx].next("EOSE");
    expect(useOwnLists.getState().bookmarks).toEqual({
      eventId: null,
      createdAt: 0,
      ids: [],
      otherTags: [],
      content: "",
    });
    expect(useOwnLists.getState().pinned).toEqual({
      eventId: null,
      createdAt: 0,
      ids: [],
      otherTags: [],
      content: "",
    });

    const event = eidList(10003, ["a", "b"], 3_000);
    addVerified(event);
    expect(useOwnLists.getState().bookmarks?.ids).toEqual(["a", "b"]);

    stop();
    useSession.setState({ status: "out", method: null, pubkey: null });
  });
});

describe("selector（⋯ メニュー・設定のブックマーク）", () => {
  it("null（未取得）の間は isBookmarked / isPinned も null", () => {
    const bookmarked = renderHook(() => useIsBookmarked("note1"));
    const pinned = renderHook(() => useIsPinned("note1"));
    expect(bookmarked.result.current).toBeNull();
    expect(pinned.result.current).toBeNull();

    act(() =>
      useOwnLists.setState({
        bookmarks: { eventId: "e1", createdAt: 1, ids: ["note1"], otherTags: [], content: "" },
        pinned: null,
      }),
    );
    expect(bookmarked.result.current).toBe(true);
    expect(pinned.result.current).toBeNull();
  });

  it("設定のブックマークは追加の新しい順（末尾が上）", () => {
    act(() =>
      useOwnLists.setState({
        bookmarks: { eventId: "e1", createdAt: 1, ids: ["a", "b", "c"], otherTags: [], content: "" },
        pinned: null,
      }),
    );
    const { result } = renderHook(() => useBookmarkedIds());
    expect(result.current).toEqual(["c", "b", "a"]);
  });
});
