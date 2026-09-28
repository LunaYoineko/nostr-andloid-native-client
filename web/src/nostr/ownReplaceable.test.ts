import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, Observable, throwError } from "rxjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { INDEXER_RELAYS } from "../lib/columnRequest";
import {
  OWN_REPLACEABLE_REFETCH_MS,
  OwnReplaceableUnreachableError,
  refetchOwnReplaceable,
} from "./ownReplaceable";
import { defaultRelaysFor, requestOnce, resetRelays } from "./pool";
import { addVerified } from "./store";

// リレーには繋がない（取り直しはテストごとに完了 / 失敗を返す）
vi.mock("./pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pool")>()),
  requestOnce: vi.fn(),
}));

const DEFAULTS = defaultRelaysFor(navigator.language ?? "");

let key: Uint8Array;
let me: string;

beforeEach(() => {
  key = generateSecretKey();
  me = getPublicKey(key);
  vi.mocked(requestOnce).mockReset();
  localStorage.clear();
  resetRelays();
});

afterEach(() => {
  resetRelays();
});

function event(kind: number, tags: string[][], createdAt: number): NostrEvent {
  return finalizeEvent({ kind, created_at: createdAt, tags, content: "" }, key);
}

/** 取り直しで latest が届いて完了する */
function respondWith(latest: NostrEvent) {
  vi.mocked(requestOnce).mockImplementation(
    () =>
      new Observable<NostrEvent>((subscriber) => {
        addVerified(latest, "wss://indexer.example");
        subscriber.next(latest);
        subscriber.complete();
      }),
  );
}

it("read ∪ write ∪ インデクサへ 5 秒で取り直し、ストアの最新版を返す", async () => {
  addVerified(event(0, [], 1_000));
  const latest = event(0, [], 2_000);
  respondWith(latest);

  await expect(refetchOwnReplaceable(me, 0)).resolves.toBe(latest);
  expect(vi.mocked(requestOnce)).toHaveBeenCalledWith(
    [...new Set([...DEFAULTS, ...INDEXER_RELAYS])],
    [{ kinds: [0], authors: [me], limit: 1 }],
    OWN_REPLACEABLE_REFETCH_MS,
  );
});

it("応答はあったが無ければ null", async () => {
  vi.mocked(requestOnce).mockReturnValue(EMPTY);
  await expect(refetchOwnReplaceable(me, 0)).resolves.toBeNull();
});

it("どのリレーからも応答が無ければ OwnReplaceableUnreachableError（手元に版があっても）", async () => {
  addVerified(event(0, [], 1_000));
  vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));

  const error = await refetchOwnReplaceable(me, 0).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(OwnReplaceableUnreachableError);
  expect(error).toMatchObject({ kind: 0 });
});

it("identifier を渡すと d タグで絞り、その版を返す", async () => {
  addVerified(event(30000, [["d", "other"]], 3_000));
  const latest = event(30000, [["d", "list"]], 2_000);
  respondWith(latest);

  await expect(refetchOwnReplaceable(me, 30000, "list")).resolves.toBe(latest);
  expect(vi.mocked(requestOnce).mock.calls[0][1]).toEqual([
    { kinds: [30000], authors: [me], limit: 1, "#d": ["list"] },
  ]);
});
