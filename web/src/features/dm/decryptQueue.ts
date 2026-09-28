import type { NostrEvent } from "nostr-tools/pure";

/** 署名者の失敗がこの回数続いたら止める（拒否・無応答のプロンプトを出し続けない） */
export const SIGNER_ERROR_LIMIT = 3;

/** 1 区切りで処理し続けてよい時間（ms）。超えたら 1 度譲ってから続ける */
const DEFAULT_BUDGET_MS = 8;

export type DecryptResult = "ok" | "invalid" | "signer-error";

export type DecryptQueue = {
  /** 溜める（同じ id は 1 回だけ） */
  push(events: NostrEvent[]): void;
  /** 処理を始める（それまでは溜めるだけ） */
  start(): void;
  /** 一時停止から続ける */
  resume(): void;
  /** 以後なにもしない */
  stop(): void;
};

function newestFirst(a: NostrEvent, b: NostrEvent): number {
  if (a.created_at !== b.created_at) return b.created_at - a.created_at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * DM の復号待ち。メインスレッドで 1 件ずつ直列に、新しいものから処理する（NIP-07 のプロンプトを連打しない）。
 * budgetMs を超えたら setTimeout で譲る（画面を固めない）。signer-error が SIGNER_ERROR_LIMIT 回続いたら止め、
 * resume() で続ける。signer-error になったイベントはこのキューでは再び処理しない（次の起動でやり直す）。
 */
export function createDecryptQueue(opts: {
  process(event: NostrEvent): Promise<DecryptResult>;
  onChange(state: { pending: number; paused: boolean }): void;
  budgetMs?: number;
  now?: () => number;
}): DecryptQueue {
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const now = opts.now ?? (() => performance.now());
  const seen = new Set<string>();
  let waiting: NostrEvent[] = [];
  let started = false;
  let paused = false;
  let stopped = false;
  let running = false;
  let inFlight = 0;
  let failures = 0;

  const notify = () => {
    if (!stopped) opts.onChange({ pending: waiting.length + inFlight, paused });
  };

  async function run() {
    if (running) return;
    running = true;
    try {
      let sliceStart = now();
      while (started && !paused && !stopped && waiting.length > 0) {
        const event = waiting.shift() as NostrEvent;
        inFlight = 1;
        notify();
        let result: DecryptResult;
        try {
          result = await opts.process(event);
        } catch {
          // 想定外の失敗は署名者の失敗と同じ扱い（記録せず次の起動でやり直す）
          result = "signer-error";
        }
        inFlight = 0;
        if (stopped) return;
        if (result === "signer-error") {
          failures++;
          if (failures >= SIGNER_ERROR_LIMIT) paused = true;
        } else {
          failures = 0;
        }
        notify();
        if (now() - sliceStart > budgetMs) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          sliceStart = now();
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    push(events) {
      if (stopped) return;
      let added = false;
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        waiting.push(event);
        added = true;
      }
      if (!added) return;
      waiting.sort(newestFirst);
      notify();
      void run();
    },
    start() {
      if (started || stopped) return;
      started = true;
      void run();
    },
    resume() {
      if (!paused || stopped) return;
      paused = false;
      failures = 0;
      notify();
      void run();
    },
    stop() {
      stopped = true;
      waiting = [];
    },
  };
}
