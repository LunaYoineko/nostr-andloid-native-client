import type { PublishResponse } from "applesauce-relay/types";
import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { Subject } from "rxjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { unixNow } from "../../lib/time";
import { pool } from "../../nostr/pool";
import { resetPublishQueueForTest } from "../../nostr/publish";
import type { Signer } from "../../nostr/signer";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { createTestSigner } from "../../test/fakeSigner";
import { publishReaction, reportNote, requestDelete } from "./reactions";

// publishEvent は本物（署名 → client タグ → ストア → 送信キュー）。署名者だけテスト用の鍵にする
const current = vi.hoisted(() => ({ signer: null as Signer | null }));
vi.mock("../../signer/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../signer/session")>();
  return { ...actual, currentSigner: () => current.signer };
});

let meKey: Uint8Array;
let sent: NostrEvent[] = [];

beforeEach(() => {
  const test = createTestSigner();
  current.signer = test.signer;
  meKey = test.secretKey;
  useSession.setState({ status: "in", method: "nip07", pubkey: test.pubkey });
  sent = [];
  // リレーには送らない（OK も返さない）
  vi.spyOn(pool, "event").mockImplementation((_relays, event) => {
    sent.push(event);
    return new Subject<PublishResponse>();
  });
});

afterEach(() => {
  resetPublishQueueForTest();
  vi.restoreAllMocks();
  current.signer = null;
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

it("requestDelete は kind:5 を送り、手元のストアから消す（client タグなし）", async () => {
  const own = finalizeEvent({ kind: 1, created_at: unixNow(), tags: [], content: "消す投稿" }, meKey);
  eventStore.add(own);
  expect(eventStore.getEvent(own.id)).toBeDefined();

  expect(await requestDelete(own)).toBe(true);
  expect(eventStore.getEvent(own.id)).toBeUndefined();
  expect(sent).toHaveLength(1);
  expect(sent[0].kind).toBe(5);
  expect(sent[0].tags).toEqual([
    ["e", own.id],
    ["k", "1"],
  ]);
});

it("リアクションには client タグが末尾に付き、通報には付かない", async () => {
  const target = finalizeEvent(
    { kind: 1, created_at: unixNow(), tags: [], content: "対象" },
    generateSecretKey(),
  );

  await publishReaction(target, "🔥");
  expect(sent[0].kind).toBe(7);
  expect(sent[0].tags.at(-1)).toEqual(["client", "Nostrism"]);

  await reportNote(target, "spam");
  expect(sent[1].kind).toBe(1984);
  expect(sent[1].tags.some((t) => t[0] === "client")).toBe(false);
});
