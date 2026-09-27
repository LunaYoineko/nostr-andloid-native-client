import type { NostrEvent } from "nostr-tools/pure";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDecryptQueue, type DecryptResult } from "./decryptQueue";

function event(id: string, createdAt: number): NostrEvent {
  return { id, pubkey: "p", kind: 1059, created_at: createdAt, tags: [], content: "", sig: "" };
}

/** 保留中の Promise をすべて進める（fake timers の setTimeout は進めない） */
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(results: DecryptResult[] | ((e: NostrEvent) => DecryptResult) = () => "ok") {
  const order: string[] = [];
  const states: { pending: number; paused: boolean }[] = [];
  let i = 0;
  const queue = createDecryptQueue({
    process: async (e) => {
      order.push(e.id);
      return typeof results === "function" ? results(e) : (results[i++] ?? "ok");
    },
    onChange: (state) => states.push(state),
    // 時間の区切りでは譲らない（譲る条件は別のテスト）
    now: () => 0,
  });
  return { queue, order, states };
}

it("start() までは溜めるだけで処理しない", async () => {
  const { queue, order, states } = setup();
  queue.push([event("a", 1), event("b", 2)]);
  await flush();
  expect(order).toEqual([]);
  expect(states.at(-1)).toEqual({ pending: 2, paused: false });

  queue.start();
  await flush();
  expect(order).toEqual(["b", "a"]);
  expect(states.at(-1)).toEqual({ pending: 0, paused: false });
});

it("created_at の新しい順に処理し、処理中に届いた新しいものを先にする", async () => {
  const { queue, order } = setup();
  queue.push([event("old", 1), event("mid", 5), event("new", 9)]);
  queue.start();
  queue.push([event("newest", 20), event("older", 0)]);
  await flush();
  // 1 件目（new）は push 前に始まっている
  expect(order).toEqual(["new", "newest", "mid", "old", "older"]);
});

it("同時に 2 件以上 process しない（直列）", async () => {
  let running = 0;
  let maxRunning = 0;
  const resolvers: (() => void)[] = [];
  const queue = createDecryptQueue({
    process: async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise<void>((resolve) => resolvers.push(resolve));
      running--;
      return "ok";
    },
    onChange: () => {},
    now: () => 0,
  });
  queue.push([event("a", 3), event("b", 2), event("c", 1)]);
  queue.start();
  queue.start();
  await flush();
  expect(resolvers).toHaveLength(1);

  for (let n = 0; n < 3; n++) {
    resolvers[n]();
    await flush();
  }
  expect(resolvers).toHaveLength(3);
  expect(maxRunning).toBe(1);
});

it("同じ id を 2 回 push しても 1 回だけ（処理後に届いた同じ id も）", async () => {
  const { queue, order } = setup();
  queue.start();
  queue.push([event("a", 1), event("a", 1)]);
  queue.push([event("a", 1)]);
  await flush();
  queue.push([event("a", 1)]);
  await flush();
  expect(order).toEqual(["a"]);
});

it("budgetMs を超えたら setTimeout で譲ってから続ける", async () => {
  let t = 0;
  const order: string[] = [];
  const queue = createDecryptQueue({
    process: async (e) => {
      order.push(e.id);
      t += 5;
      return "ok";
    },
    onChange: () => {},
    budgetMs: 8,
    now: () => t,
  });
  queue.push([event("1", 4), event("2", 3), event("3", 2), event("4", 1)]);
  queue.start();
  await flush();
  // 1 件目で 5ms（まだ続ける）、2 件目で 10ms > 8ms（譲る）
  expect(order).toEqual(["1", "2"]);
  expect(vi.getTimerCount()).toBe(1);

  vi.advanceTimersByTime(0);
  await flush();
  expect(order).toEqual(["1", "2", "3", "4"]);
});

it("signer-error が 3 回続いたら止め、resume() で続ける。ok / invalid で連続回数が戻る", async () => {
  const results: DecryptResult[] = [
    "signer-error",
    "signer-error",
    "ok",
    "signer-error",
    "invalid",
    "signer-error",
    "signer-error",
    "signer-error",
  ];
  const { queue, order, states } = setup(results);
  const events = Array.from({ length: 10 }, (_, n) => event(`e${n}`, 100 - n));
  queue.push(events);
  queue.start();
  await flush();

  expect(order).toEqual(["e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7"]);
  expect(states.at(-1)).toEqual({ pending: 2, paused: true });

  queue.resume();
  await flush();
  expect(order).toEqual(events.map((e) => e.id));
  expect(states.at(-1)).toEqual({ pending: 0, paused: false });
});

it("signer-error になったイベントはこのキューでは再び処理しない", async () => {
  const { queue, order } = setup(() => "signer-error");
  queue.start();
  queue.push([event("a", 1)]);
  await flush();
  queue.push([event("a", 1)]);
  await flush();
  expect(order).toEqual(["a"]);
});

it("stop() の後はなにもしない", async () => {
  const { queue, order, states } = setup();
  queue.push([event("a", 1)]);
  queue.stop();
  queue.start();
  queue.push([event("b", 2)]);
  await flush();
  expect(order).toEqual([]);
  const count = states.length;
  queue.resume();
  expect(states).toHaveLength(count);
});
