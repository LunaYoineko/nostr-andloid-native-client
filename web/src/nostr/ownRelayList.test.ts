import { normalizeURL } from "applesauce-core/helpers/url";
import { finalizeEvent, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, Observable, Subject, throwError } from "rxjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { INDEXER_RELAYS } from "../lib/columnRequest";
import { useSession } from "../signer/session";
import { createTestSigner } from "../test/fakeSigner";
import { followOwnRelayList, OWN_RELAYLIST_TIMEOUT_MS, startOwnRelayList } from "./outbox";
import { defaultRelaysFor, pool, RELAYS_KEY, requestOnce, resetRelays, subscribe, useRelays } from "./pool";
import { publishEvent, resetPublishQueueForTest } from "./publish";
import { addVerified } from "./store";

// 自分の kind:10002 の取得だけ差し替える（プール・集合・購読は本物。テストの WebSocket は接続しない）
vi.mock("./pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pool")>()),
  requestOnce: vi.fn(),
}));

const DEFAULTS = defaultRelaysFor(navigator.language ?? "");

let me: string;
let secretKey: Uint8Array;
let signer: ReturnType<typeof createTestSigner>["signer"];
const cleanups: (() => void)[] = [];

beforeEach(() => {
  ({ signer, pubkey: me, secretKey } = createTestSigner());
  vi.mocked(requestOnce).mockReset();
  localStorage.clear();
  resetRelays();
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetPublishQueueForTest();
  vi.restoreAllMocks();
  useSession.setState({ status: "loading", method: null, pubkey: null });
  localStorage.clear();
  resetRelays();
});

function relayList(tags: string[][], createdAt = 1_000): NostrEvent {
  return finalizeEvent({ kind: 10002, created_at: createdAt, tags, content: "" }, secretKey);
}

/** requestOnce がリレーから events を受け取った（ストアに入れて完了する）ことにする */
function respondWith(...events: NostrEvent[]) {
  vi.mocked(requestOnce).mockImplementation(
    () =>
      new Observable<NostrEvent>((subscriber) => {
        for (const event of events) {
          addVerified(event, "wss://indexer.example");
          subscriber.next(event);
        }
        subscriber.complete();
      }),
  );
}

function follow(pubkey: string) {
  const subscription = followOwnRelayList(pubkey);
  cleanups.push(() => subscription.unsubscribe());
}

it("kind:10002 のあるアカウントはインデクサ + 既定リレーから取り、read リレーで購読し write リレーへ発行する", async () => {
  respondWith(
    relayList([
      ["r", "wss://both.example"],
      ["r", "wss://read.example", "read"],
      ["r", "wss://write.example", "write"],
    ]),
  );
  // ログイン直後（既定リレー）から張っている購読
  const sub = subscribe({ kinds: [1], limit: 1 }).subscribe();
  cleanups.push(() => sub.unsubscribe());

  follow(me);

  expect(vi.mocked(requestOnce)).toHaveBeenCalledWith(
    [...new Set([...INDEXER_RELAYS, ...DEFAULTS])],
    [{ kinds: [10002], authors: [me], limit: 1 }],
    OWN_RELAYLIST_TIMEOUT_MS,
  );
  expect(useRelays.getState()).toEqual({
    read: ["wss://both.example/", "wss://read.example/"],
    write: ["wss://both.example/", "wss://write.example/"],
    source: "nip65",
  });

  // 張ったままの購読が read リレーへ広がる（write だけのリレーには張らない）
  const connected = [...pool.relays.keys()];
  expect(connected).toEqual(expect.arrayContaining(["wss://both.example/", "wss://read.example/"]));
  expect(connected).not.toContain(normalizeURL("wss://write.example"));

  // 発行は write リレーへ
  const event = vi.spyOn(pool, "event").mockReturnValue(new Subject());
  useSession.setState({ status: "in", method: "nip07", pubkey: me });
  await publishEvent({ kind: 1, content: "hi", tags: [] }, { signer });
  expect(event.mock.calls[0][0]).toEqual(["wss://both.example/", "wss://write.example/"]);
});

it("kind:10002 の無いアカウント・どこからも応答が無いときは既定のまま", () => {
  respondWith();
  follow(me);
  expect(useRelays.getState()).toEqual({ read: DEFAULTS, write: DEFAULTS, source: "default" });

  vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));
  follow(createTestSigner().pubkey);
  expect(useRelays.getState()).toEqual({ read: DEFAULTS, write: DEFAULTS, source: "default" });
});

it("手元にある新しい版（DB から戻した分・後から届いた分）も反映する", () => {
  vi.mocked(requestOnce).mockReturnValue(EMPTY);
  addVerified(relayList([["r", "wss://cached.example"]], 1_000));
  follow(me);
  expect(useRelays.getState().read).toEqual(["wss://cached.example/"]);

  addVerified(relayList([["r", "wss://newer.example"]], 2_000));
  expect(useRelays.getState().read).toEqual(["wss://newer.example/"]);
});

it("nostrism.relays があれば kind:10002 を取りに行かず、保存値を使う", () => {
  localStorage.setItem(RELAYS_KEY, JSON.stringify(["wss://saved.example"]));
  resetRelays();
  respondWith(relayList([["r", "wss://nip65.example"]]));

  follow(me);

  expect(vi.mocked(requestOnce)).not.toHaveBeenCalled();
  expect(useRelays.getState()).toEqual({
    read: ["wss://saved.example"],
    write: ["wss://saved.example"],
    source: "saved",
  });
});

it("startOwnRelayList はログインで反映し、ログアウトで既定に戻す", () => {
  respondWith(relayList([["r", "wss://mine.example"]]));
  const stop = startOwnRelayList();
  cleanups.push(stop);
  expect(vi.mocked(requestOnce)).not.toHaveBeenCalled();

  useSession.setState({ status: "in", method: "nip07", pubkey: me });
  expect(useRelays.getState().read).toEqual(["wss://mine.example/"]);

  useSession.setState({ status: "out", method: null, pubkey: null });
  expect(useRelays.getState()).toEqual({ read: DEFAULTS, write: DEFAULTS, source: "default" });
});
