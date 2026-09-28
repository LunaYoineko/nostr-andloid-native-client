import type { PublishResponse } from "applesauce-relay/types";
import type { NostrEvent } from "nostr-tools/pure";
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "../../nostr/pool";
import { ACK_TIMEOUT_MS, resetPublishQueueForTest, unsent$ } from "../../nostr/publish";
import { eventStore } from "../../nostr/store";
import { currentSigner, useSession } from "../../signer/session";
import { createTestSigner } from "../../test/fakeSigner";
import { chatRelays, sendChannelMessage } from "./send";

// リレーには繋がず、送信ごとに Subject を返す（OK はテストから流す）
vi.mock("../../nostr/pool", async () => {
  const { Subject } = await import("rxjs");
  const write = ["wss://w1", "wss://yabu.me"];
  return {
    pool: { event: vi.fn() },
    writeRelays: () => write,
    connections$: new Subject(),
  };
});
vi.mock("../../signer/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../signer/session")>()),
  currentSigner: vi.fn(),
}));

const CH = "c".repeat(64);
const PARENT = "d".repeat(64);
const ALICE = "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2";

let sends: { relays: string[]; event: NostrEvent; responses: Subject<PublishResponse> }[] = [];

beforeEach(() => {
  sends = [];
  vi.mocked(pool.event).mockReset();
  vi.mocked(pool.event).mockImplementation((relays, event) => {
    const responses = new Subject<PublishResponse>();
    sends.push({ relays: relays as string[], event, responses });
    return responses;
  });
  const { signer, pubkey } = createTestSigner();
  vi.mocked(currentSigner).mockReturnValue(signer);
  useSession.setState({ status: "in", method: "nip07", pubkey });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});

afterEach(() => {
  resetPublishQueueForTest();
  vi.useRealTimers();
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

describe("chatRelays", () => {
  it("write ∪ チャンネルのリレー（wss:// のみ。末尾の / の違いは同じリレー）", () => {
    expect(
      chatRelays(
        ["wss://yabu.me/", "ws://insecure.example", "wss://relay-jp.example/"],
        ["wss://w1", "wss://yabu.me"],
      ),
    ).toEqual(["wss://w1", "wss://yabu.me", "wss://relay-jp.example/"]);
  });
});

describe("sendChannelMessage", () => {
  it("送信キュー（publishEvent）を通る: 署名 → client タグ → ストア → write ∪ チャンネルのリレーへ送信。受理が無ければ未送信", async () => {
    const parent: NostrEvent = {
      id: PARENT,
      pubkey: ALICE,
      kind: 42,
      created_at: 1,
      content: "親",
      tags: [["e", CH, "", "root"]],
      sig: "",
    };
    const signed = await sendChannelMessage({
      channelId: CH,
      channelRelays: ["wss://yabu.me/", "wss://relay-jp.example/"],
      content: "返信 #nostr",
      replyTo: parent,
      emojis: new Map(),
    });
    if (!signed) throw new Error("not sent");
    expect(signed.kind).toBe(42);
    expect(signed.tags).toEqual([
      ["e", CH, "wss://yabu.me/", "root"],
      ["e", PARENT, "wss://yabu.me/", "reply"],
      ["p", ALICE, "wss://yabu.me/"],
      ["t", "nostr"],
      ["client", "Nostrism"],
    ]);
    // 楽観的にストアへ（ルームにすぐ出る）
    expect(eventStore.getEvent(signed.id)).toBeDefined();
    expect(sends).toHaveLength(1);
    expect(sends[0].event.id).toBe(signed.id);
    expect(sends[0].relays).toEqual(["wss://w1", "wss://yabu.me", "wss://relay-jp.example/"]);

    // 受理が無いまま時間切れ → 未送信（「未送信・タップで再送」）
    vi.advanceTimersByTime(ACK_TIMEOUT_MS);
    expect(unsent$.value.has(signed.id)).toBe(true);
  });

  it("受理されたら未送信にならない", async () => {
    const signed = await sendChannelMessage({
      channelId: CH,
      channelRelays: [],
      content: "やあ",
      replyTo: null,
      emojis: new Map(),
    });
    if (!signed) throw new Error("not sent");
    expect(signed.tags).toEqual([
      ["e", CH, "", "root"],
      ["client", "Nostrism"],
    ]);
    expect(sends[0].relays).toEqual(["wss://w1", "wss://yabu.me"]);
    sends[0].responses.next({ ok: true, from: "wss://w1" } as PublishResponse);
    vi.advanceTimersByTime(ACK_TIMEOUT_MS);
    expect(unsent$.value.has(signed.id)).toBe(false);
  });

  it("本文が空なら送らない", async () => {
    expect(
      await sendChannelMessage({
        channelId: CH,
        channelRelays: [],
        content: " \n",
        replyTo: null,
        emojis: new Map(),
      }),
    ).toBeNull();
    expect(sends).toHaveLength(0);
  });
});
