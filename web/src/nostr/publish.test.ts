import type { PublishResponse } from "applesauce-relay/types";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { nsecEncode } from "nostr-tools/nip19";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  type NostrEvent,
  verifyEvent,
} from "nostr-tools/pure";
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type NostrismDb, type PublishQueueRow } from "../db/schema";
import { useSession } from "../signer/session";
import { installTestVault, resetSession } from "../test/fakeNostr";
import { createTestSigner } from "../test/fakeSigner";
import { connections$, pool, type RelayConnections } from "./pool";
import {
  discardUnsent,
  isAccepted,
  PublishError,
  publishEvent,
  resetPublishQueueForTest,
  retryUnsent,
  retryUnsentNow,
  setPublishAccount,
  shouldAutoRetry,
  startPublishQueue,
  unconfirmed$,
  unsent$,
  withClientTag,
} from "./publish";
import type { Signer } from "./signer";
import { eventStore } from "./store";

// リレーには繋がず、送信ごとに Subject を返す（OK はテストから流す）
vi.mock("./pool", async () => {
  const { Subject } = await import("rxjs");
  return {
    pool: { event: vi.fn() },
    writeRelays: () => ["wss://r1", "wss://r2"],
    connections$: new Subject(),
  };
});

const RELAYS = ["wss://r1", "wss://r2"];

let sends: { relays: string[]; event: NostrEvent; responses: Subject<PublishResponse> }[] = [];
let signer: Signer;
let secretKey: Uint8Array;
let me: string;
let notices = 0;
let noticeSub: { unsubscribe(): void } | null = null;
const databases: NostrismDb[] = [];

beforeEach(() => {
  sends = [];
  vi.mocked(pool.event).mockReset();
  vi.mocked(pool.event).mockImplementation((relays, event) => {
    const responses = new Subject<PublishResponse>();
    sends.push({ relays: relays as string[], event, responses });
    return responses;
  });
  ({ signer, pubkey: me, secretKey } = createTestSigner());
  useSession.setState({ status: "in", method: "nip07", pubkey: me });
  notices = 0;
  noticeSub = unconfirmed$.subscribe(() => {
    notices++;
  });
  // fake-indexeddb は setImmediate で進むので、それは本物のまま残す
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});

afterEach(() => {
  noticeSub?.unsubscribe();
  resetPublishQueueForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useSession.setState({ status: "loading", method: null, pubkey: null });
  for (const database of databases.splice(0)) database.close();
});

async function openDb(): Promise<NostrismDb> {
  const database = createDatabase({
    name: `pq-${crypto.randomUUID()}`,
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  });
  await database.open();
  databases.push(database);
  return database;
}

function note(content = "hi"): { kind: number; content: string; tags: string[][] } {
  return { kind: 1, content, tags: [] };
}

function unsentHas(id: string): boolean {
  return unsent$.getValue().has(id);
}

function signedBy(key: Uint8Array, content: string): NostrEvent {
  return finalizeEvent({ kind: 1, created_at: 1_800_000_000, tags: [], content }, key);
}

/** from 番目以降に送ったイベントの id（DB の読み出し順に依らないよう並べ替える） */
function sentIds(from: number): string[] {
  return sends
    .slice(from)
    .map((s) => s.event.id)
    .sort();
}

function idsOf(events: NostrEvent[]): string[] {
  return events.map((e) => e.id).sort();
}

function rowOf(event: NostrEvent, attempts: number): PublishQueueRow {
  return {
    eventId: event.id,
    payload: event,
    createdAt: event.created_at,
    attempts,
    relays: null,
    refId: null,
  };
}

describe("純関数", () => {
  it("withClientTag: 対象 kind は末尾に client タグ、対象外・既存はそのまま、引数は書き換えない", () => {
    for (const kind of [1, 6, 16, 7, 42, 1111]) {
      expect(withClientTag({ kind, content: "", tags: [["t", "x"]] }).tags).toEqual([
        ["t", "x"],
        ["client", "Nostrism"],
      ]);
    }
    for (const kind of [0, 3, 5, 1984, 10002]) {
      expect(withClientTag({ kind, content: "", tags: [["p", "x"]] }).tags).toEqual([["p", "x"]]);
    }
    expect(withClientTag({ kind: 1, content: "", tags: [["client", "X"]] }).tags).toEqual([["client", "X"]]);
    const tags = [["t", "a"]];
    const draft = { kind: 1, content: "", tags };
    withClientTag(draft);
    expect(draft.tags).toBe(tags);
    expect(tags).toEqual([["t", "a"]]);
  });

  it("isAccepted: ok か duplicate: だけが受理", () => {
    expect(isAccepted(true)).toBe(true);
    expect(isAccepted(false, "duplicate: have it")).toBe(true);
    expect(isAccepted(false, "  duplicate:x")).toBe(true);
    expect(isAccepted(false, "blocked: spam")).toBe(false);
    expect(isAccepted(false)).toBe(false);
  });

  it("shouldAutoRetry: 1〜4 だけ", () => {
    expect([0, 1, 4, 5].map(shouldAutoRetry)).toEqual([false, true, true, false]);
  });
});

describe("publishEvent", () => {
  it("署名してストアに入れ、DB に attempts 0 で積み、設定リレーへ 1 回送る", async () => {
    const database = await openDb();
    await startPublishQueue({ database });

    const signed = await publishEvent(note(), { signer });

    expect(signed.pubkey).toBe(me);
    expect(signed.tags).toEqual([["client", "Nostrism"]]);
    expect(eventStore.getEvent(signed.id)).toBeDefined();
    expect(await database.publishQueue.get(signed.id)).toMatchObject({
      attempts: 0,
      relays: null,
      refId: null,
    });
    expect(pool.event).toHaveBeenCalledTimes(1);
    expect(pool.event).toHaveBeenCalledWith(RELAYS, signed);
  });

  it.each([[{ ok: true, from: "wss://r1" }], [{ ok: false, message: "duplicate: x", from: "wss://r2" }]])(
    "OK %o で受理 = 行が消え、未送信にならず、トーストも出ない",
    async (response) => {
      const database = await openDb();
      await startPublishQueue({ database });
      const signed = await publishEvent(note(), { signer });

      sends[0].responses.next(response);

      expect(await database.publishQueue.get(signed.id)).toBeUndefined();
      vi.advanceTimersByTime(10_000);
      expect(unsentHas(signed.id)).toBe(false);
      expect(notices).toBe(0);
      // メモリにも無い（再送しても送らない）
      retryUnsentNow(signed.id);
      expect(pool.event).toHaveBeenCalledTimes(1);
    },
  );

  it("拒否（blocked）だけなら受理しない", async () => {
    await startPublishQueue({ database: null });
    const signed = await publishEvent(note(), { signer });
    sends[0].responses.next({ ok: false, message: "blocked: spam", from: "wss://r1" });
    vi.advanceTimersByTime(10_000);
    expect(unsentHas(signed.id)).toBe(true);
  });

  it("10 秒で受理が無ければ attempts 1・未送信・トースト 1 回。トーストは 30 秒に 1 回まで", async () => {
    const database = await openDb();
    await startPublishQueue({ database });
    const first = await publishEvent(note("1"), { signer });

    vi.advanceTimersByTime(9_999);
    expect(unsentHas(first.id)).toBe(false);
    vi.advanceTimersByTime(1);
    expect((await database.publishQueue.get(first.id))?.attempts).toBe(1);
    expect(unsentHas(first.id)).toBe(true);
    expect(notices).toBe(1);

    const second = await publishEvent(note("2"), { signer });
    vi.advanceTimersByTime(10_000);
    expect(unsentHas(second.id)).toBe(true);
    expect(notices).toBe(1);

    vi.advanceTimersByTime(30_000);
    await publishEvent(note("3"), { signer });
    vi.advanceTimersByTime(10_000);
    expect(notices).toBe(2);
  });

  it("自分のイベントがリレーから返ってきたら（エコー）10 秒を待たずに受理", async () => {
    const database = await openDb();
    await startPublishQueue({ database });
    const signed = await publishEvent(note(), { signer });

    eventStore.add({ ...signed }, "wss://r1");

    expect(await database.publishQueue.get(signed.id)).toBeUndefined();
    vi.advanceTimersByTime(10_000);
    expect(unsentHas(signed.id)).toBe(false);
    expect(notices).toBe(0);
  });

  it("opts.relays を送り先と行に使う", async () => {
    const database = await openDb();
    await startPublishQueue({ database });
    const signed = await publishEvent(note(), { signer, relays: ["wss://x"] });
    expect(sends[0].relays).toEqual(["wss://x"]);
    expect((await database.publishQueue.get(signed.id))?.relays).toEqual(["wss://x"]);
  });

  it("署名中に中止されたら aborted。積まず・送らない", async () => {
    const database = await openDb();
    await startPublishQueue({ database });
    let release: () => void = () => {};
    const slow: Signer = {
      ...signer,
      signEvent: (unsigned) =>
        new Promise((resolve) => {
          release = () => resolve(finalizeEvent(unsigned, secretKey));
        }),
    };
    const controller = new AbortController();
    const pending = publishEvent(note(), { signer: slow, signal: controller.signal });
    controller.abort();
    release();

    await expect(pending).rejects.toMatchObject({ name: "PublishError", reason: "aborted" });
    expect(pool.event).not.toHaveBeenCalled();
    expect(await database.publishQueue.count()).toBe(0);
  });

  it("署名者の例外・別の鍵の署名は sign-failed、未ログインで署名者なしは no-signer", async () => {
    await startPublishQueue({ database: null });
    const failing: Signer = {
      ...signer,
      signEvent: async () => {
        throw new Error("rejected");
      },
    };
    await expect(publishEvent(note(), { signer: failing })).rejects.toMatchObject({ reason: "sign-failed" });

    const other = createTestSigner().signer;
    await expect(publishEvent(note(), { signer: other })).rejects.toMatchObject({ reason: "sign-failed" });

    useSession.setState({ status: "out", method: null, pubkey: null });
    const noSigner = publishEvent(note());
    await expect(noSigner).rejects.toBeInstanceOf(PublishError);
    await expect(noSigner).rejects.toMatchObject({ reason: "no-signer" });
    expect(pool.event).not.toHaveBeenCalled();
  });

  it("秘密鍵（nsec）でログイン中はセッションの署名者（保管庫の鍵）で署名して送る", async () => {
    await installTestVault();
    try {
      await useSession.getState().loginWithNsec(nsecEncode(secretKey));
      await startPublishQueue({ database: null });

      const signed = await publishEvent(note("nsec"));

      expect(signed.pubkey).toBe(me);
      expect(verifyEvent(signed)).toBe(true);
      expect(sends.map((s) => s.event.id)).toEqual([signed.id]);
    } finally {
      resetSession();
    }
  });
});

describe("再送", () => {
  async function startWith(rows: PublishQueueRow[]): Promise<NostrismDb> {
    const database = await openDb();
    await database.publishQueue.bulkPut(rows);
    await startPublishQueue({ database });
    return database;
  }

  it("retryUnsent: 自分の attempts 1〜4 を同じイベントで送り直す（5 は送らない）。30 秒に 1 回まで", async () => {
    const events = [1, 2, 3, 4, 5].map((n) => signedBy(secretKey, `r${n}`));
    await startWith(events.map((e, i) => rowOf(e, i + 1)));
    expect(pool.event).not.toHaveBeenCalled();

    setPublishAccount(me);
    expect(sentIds(0)).toEqual(idsOf(events.slice(0, 4)));
    expect(sends.every((s) => s.relays.join() === RELAYS.join())).toBe(true);

    // 10 秒で未受理（attempts 2〜5 に）→ 30 秒経つまでは送らない
    vi.advanceTimersByTime(10_000);
    retryUnsent();
    expect(pool.event).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(20_000);
    retryUnsent();
    expect(sentIds(4)).toEqual(idsOf(events.slice(0, 3)));
  });

  it("retryUnsentNow は attempts 5 でも送る", async () => {
    const event = signedBy(secretKey, "max");
    await startWith([rowOf(event, 5)]);
    setPublishAccount(me);
    expect(pool.event).not.toHaveBeenCalled();

    retryUnsentNow(event.id);
    expect(sends.map((s) => s.event.id)).toEqual([event.id]);
  });

  it("startPublishQueue: DB の行をストアに出し、attempts 0 を 1 に。アカウントを決めると他人の行を消し、自分の行を送る", async () => {
    const otherKey = generateSecretKey();
    const mine0 = signedBy(secretKey, "a0");
    const mine2 = signedBy(secretKey, "a2");
    const others = signedBy(otherKey, "o1");
    const database = await startWith([rowOf(mine0, 0), rowOf(mine2, 2), rowOf(others, 1)]);

    for (const e of [mine0, mine2, others]) expect(eventStore.getEvent(e.id)).toBeDefined();
    expect((await database.publishQueue.get(mine0.id))?.attempts).toBe(1);
    expect(unsentHas(mine0.id) && unsentHas(mine2.id) && unsentHas(others.id)).toBe(true);

    setPublishAccount(me);
    expect(await database.publishQueue.get(others.id)).toBeUndefined();
    expect(unsentHas(others.id)).toBe(false);
    expect(getPublicKey(otherKey)).not.toBe(me);
    expect(sentIds(0)).toEqual(idsOf([mine0, mine2]));
  });

  it("開始前に発行した行は開始後に DB へ書く", async () => {
    const signed = await publishEvent(note(), { signer });
    const database = await openDb();
    await startPublishQueue({ database });
    expect(await database.publishQueue.get(signed.id)).toMatchObject({ attempts: 0 });
  });

  it("DB が無くても発行・受理が動く", async () => {
    await startPublishQueue({ database: null });
    const signed = await publishEvent(note(), { signer });
    sends[0].responses.next({ ok: true, from: "wss://r1" });
    retryUnsentNow(signed.id);
    expect(pool.event).toHaveBeenCalledTimes(1);
  });

  it("再接続（connected の増加）・復帰（visible）・online で再送する（30 秒に 1 回まで）", async () => {
    const event = signedBy(secretKey, "retry");
    await startWith([rowOf(event, 1)]);
    setPublishAccount(me);
    expect(pool.event).toHaveBeenCalledTimes(1);
    const connections = connections$ as unknown as Subject<RelayConnections>;

    vi.advanceTimersByTime(30_000);
    connections.next({ connected: 0, total: 2 });
    expect(pool.event).toHaveBeenCalledTimes(1);
    connections.next({ connected: 1, total: 2 });
    expect(pool.event).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(30_000);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(pool.event).toHaveBeenCalledTimes(3);
    window.dispatchEvent(new Event("online"));
    expect(pool.event).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(30_000);
    window.dispatchEvent(new Event("online"));
    expect(pool.event).toHaveBeenCalledTimes(4);
  });

  it("discardUnsent は署名済みイベントを返し、行と手元の投稿を消す。無い id は null", async () => {
    const database = await openDb();
    await startPublishQueue({ database });
    const signed = await publishEvent(note("戻す"), { signer });

    expect(discardUnsent(signed.id)).toBe(signed);
    expect(eventStore.getEvent(signed.id)).toBeUndefined();
    expect(await database.publishQueue.get(signed.id)).toBeUndefined();
    expect(discardUnsent(signed.id)).toBeNull();
  });
});
