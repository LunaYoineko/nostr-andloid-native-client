import { act, renderHook } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import type { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { requestOnceUnstored } from "../../nostr/pool";
import {
  FOLLOWERS_PAGE_SIZE,
  FOLLOWERS_WAIT_MS,
  FollowerScan,
  followersFilter,
  followersPage$,
  useFollowers,
} from "./followers";

// リレーには繋がず、REQ ごとに Subject を返す（イベント・完了はテストから流す）
vi.mock("../../nostr/pool", async () => {
  const { Subject } = await import("rxjs");
  return { requestOnceUnstored: vi.fn(() => new Subject<NostrEvent>()) };
});

const TARGET = "t".repeat(64);

beforeEach(() => {
  vi.mocked(requestOnceUnstored).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function last() {
  return vi.mocked(requestOnceUnstored).mock.results.at(-1)?.value as Subject<NostrEvent>;
}

function contacts(signer: Uint8Array, follows: string[], at = 100): NostrEvent {
  return finalizeEvent({ kind: 3, created_at: at, tags: follows.map((p) => ["p", p]), content: "" }, signer);
}

describe("FollowerScan", () => {
  it("発行者ごとに最新の kind:3 だけを見る（古い版が対象を含んでいても新しい版が含まなければ数えない）", () => {
    const scan = new FollowerScan(TARGET);
    const author = generateSecretKey();
    scan.record(contacts(author, [TARGET], 100));
    expect(scan.followers()).toEqual([getPublicKey(author)]);

    scan.record(contacts(author, ["other"], 200));
    expect(scan.followers()).toEqual([]);
    expect(scan.size).toBe(1);
  });

  it("同じ発行者の古い版は無視する（新しい版が先に来ても後に来ても結果は同じ）", () => {
    const scan = new FollowerScan(TARGET);
    const author = generateSecretKey();
    scan.record(contacts(author, [TARGET], 200));
    scan.record(contacts(author, [], 100));
    expect(scan.followers()).toEqual([getPublicKey(author)]);
  });

  it("kind:3 以外は無視する", () => {
    const scan = new FollowerScan(TARGET);
    const other = finalizeEvent(
      { kind: 1, created_at: 100, tags: [["p", TARGET]], content: "" },
      generateSecretKey(),
    );
    scan.record(other);
    expect(scan.size).toBe(0);
  });

  it("cursor は見えた created_at の最小 − 1。何も見えていなければ undefined", () => {
    const scan = new FollowerScan(TARGET);
    expect(scan.cursor()).toBeUndefined();
    scan.record(contacts(generateSecretKey(), [TARGET], 300));
    scan.record(contacts(generateSecretKey(), [TARGET], 150));
    expect(scan.cursor()).toBe(149);
  });
});

describe("followersFilter", () => {
  it("INDEXER 向けの #p フィルタ。cursor が無ければ until を付けない、あれば付ける", () => {
    const scan = new FollowerScan(TARGET);
    expect(followersFilter(scan)).toEqual({ kinds: [3], "#p": [TARGET], limit: FOLLOWERS_PAGE_SIZE });
    scan.record(contacts(generateSecretKey(), [TARGET], 500));
    expect(followersFilter(scan)).toEqual({
      kinds: [3],
      "#p": [TARGET],
      limit: FOLLOWERS_PAGE_SIZE,
      until: 499,
    });
  });
});

describe("followersPage$", () => {
  it("INDEXER_RELAYS だけへ REQ を張り、署名を検証してから記録する（不正な署名は無視）", () => {
    const scan = new FollowerScan(TARGET);
    const sub = followersPage$(scan).subscribe();
    expect(vi.mocked(requestOnceUnstored)).toHaveBeenCalledWith(
      INDEXER_RELAYS,
      [{ kinds: [3], "#p": [TARGET], limit: FOLLOWERS_PAGE_SIZE }],
      FOLLOWERS_WAIT_MS,
    );

    const author = generateSecretKey();
    const good = contacts(author, [TARGET], 100);
    const tampered: NostrEvent = { ...JSON.parse(JSON.stringify(good)), content: "" };
    act(() => {
      last().next(tampered);
      last().next(good);
    });
    sub.unsubscribe();
    expect(scan.followers()).toEqual([getPublicKey(author)]);
  });

  it("EOSE（complete）で 1 度だけ結果を流す。hasMore = 見えた発行者が増えたか", async () => {
    const scan = new FollowerScan(TARGET);
    const results: { followers: string[]; hasMore: boolean }[] = [];
    const sub = followersPage$(scan).subscribe((page) => results.push(page));
    const author = generateSecretKey();
    act(() => {
      last().next(contacts(author, [TARGET], 100));
      last().complete();
    });
    expect(results).toEqual([{ followers: [getPublicKey(author)], hasMore: true }]);
    sub.unsubscribe();

    // 2 ページ目: 何も増えなければ hasMore は false
    const sub2 = followersPage$(scan).subscribe((page) => results.push(page));
    act(() => last().complete());
    expect(results[1]).toEqual({ followers: [getPublicKey(author)], hasMore: false });
    sub2.unsubscribe();
  });

  it("どこからも届かなくても（error）それまでの分で終える", () => {
    const scan = new FollowerScan(TARGET);
    let result: { followers: string[]; hasMore: boolean } | undefined;
    const sub = followersPage$(scan).subscribe((page) => {
      result = page;
    });
    act(() => last().error(new Error("timeout")));
    expect(result).toEqual({ followers: [], hasMore: false });
    sub.unsubscribe();
  });
});

describe("useFollowers", () => {
  it("押すまで REQ を出さない。start() で最初のページを取る", () => {
    const { result } = renderHook(() => useFollowers(TARGET));
    expect(result.current.followers).toBeNull();
    expect(vi.mocked(requestOnceUnstored)).not.toHaveBeenCalled();

    act(() => result.current.start());
    expect(vi.mocked(requestOnceUnstored)).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);

    const author = generateSecretKey();
    act(() => {
      last().next(contacts(author, [TARGET]));
      last().complete();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.followers).toEqual([getPublicKey(author)]);
  });

  it("start() を 2 回押しても取得済みなら取り直さない。loadMore() は続きを取る", () => {
    const { result } = renderHook(() => useFollowers(TARGET));
    act(() => result.current.start());
    act(() => last().complete());
    expect(vi.mocked(requestOnceUnstored)).toHaveBeenCalledTimes(1);

    act(() => result.current.start());
    expect(vi.mocked(requestOnceUnstored)).toHaveBeenCalledTimes(1);

    act(() => result.current.loadMore());
    expect(vi.mocked(requestOnceUnstored)).toHaveBeenCalledTimes(2);
  });

  it("取得中は loadMore() を無視する（二重に REQ を出さない）", () => {
    const { result } = renderHook(() => useFollowers(TARGET));
    act(() => result.current.start());
    expect(vi.mocked(requestOnceUnstored)).toHaveBeenCalledTimes(1);
    act(() => result.current.loadMore());
    expect(vi.mocked(requestOnceUnstored)).toHaveBeenCalledTimes(1);
  });

  it("閉じると REQ を CLOSE する", () => {
    const { result, unmount } = renderHook(() => useFollowers(TARGET));
    act(() => result.current.start());
    const sub = last();
    expect(sub.observed).toBe(true);
    unmount();
    expect(sub.observed).toBe(false);
  });
});
