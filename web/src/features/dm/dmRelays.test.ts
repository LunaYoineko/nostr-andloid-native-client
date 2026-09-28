import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, Observable, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DmMessageRow } from "../../db/schema";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { requestOnce, resetRelays, useRelays } from "../../nostr/pool";
import { PublishError, publishEvent } from "../../nostr/publish";
import { addVerified } from "../../nostr/store";
import {
  dmRelaysFromEvent,
  isNip04OnlyPeer,
  OWN_DMRELAY_REFETCH_MS,
  ownDmRelaysOrSeed,
  PEER_DMRELAY_WAIT_MS,
  peerDmRelays,
} from "./dmRelays";

// リレーには繋がない（取り直しはテストごとに完了 / 失敗を返す）
vi.mock("../../nostr/pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/pool")>()),
  requestOnce: vi.fn(),
}));

// 署名・送信はしない（送信キューの入口だけ差し替える）
vi.mock("../../nostr/publish", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/publish")>()),
  publishEvent: vi.fn(async () => ({})),
}));

const READ = [
  "wss://read1.example",
  "wss://read2.example",
  "wss://read3.example",
  "wss://read4.example",
  "wss://read5.example",
];
const WRITE = ["wss://write.example"];

let key: Uint8Array;
let me: string;

beforeEach(() => {
  key = generateSecretKey();
  me = getPublicKey(key);
  vi.mocked(requestOnce).mockReset();
  vi.mocked(publishEvent).mockClear();
  useRelays.setState({ read: READ, write: WRITE, source: "nip65" }, true);
});

afterEach(() => {
  resetRelays();
});

function dmRelayList(tags: string[][], signer = key, createdAt = 1_000): NostrEvent {
  return finalizeEvent({ kind: 10050, created_at: createdAt, tags, content: "" }, signer);
}

/** 取り直しで latest が返ってくる（EventStore にも入る。requestOnce と同じ） */
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

it("relay タグの wss:// だけを正規化して重複なしで返す（ws:// と壊れた URL は捨てる）", () => {
  const event = finalizeEvent(
    {
      kind: 10050,
      created_at: 1,
      tags: [
        ["relay", "wss://dm.example"],
        ["relay", "wss://DM.example/"],
        ["relay", "ws://insecure.example"],
        ["relay", "wss://"],
        ["relay"],
        ["r", "wss://other.example"],
        ["relay", "wss://inbox.example/path"],
      ],
      content: "",
    },
    generateSecretKey(),
  );
  expect(dmRelaysFromEvent(event)).toEqual(["wss://dm.example/", "wss://inbox.example/path"]);
});

describe("peerDmRelays", () => {
  it("手元にあれば問い合わせずにそれを返す", async () => {
    const peerKey = generateSecretKey();
    addVerified(dmRelayList([["relay", "wss://peer-dm.example"]], peerKey));
    expect(await peerDmRelays(getPublicKey(peerKey))).toEqual(["wss://peer-dm.example/"]);
    expect(vi.mocked(requestOnce)).not.toHaveBeenCalled();
  });

  it("無ければ read・インデクサ・相手の write へ 2.5 秒問い合わせ、届いたものを返す", async () => {
    const peerKey = generateSecretKey();
    const peer = getPublicKey(peerKey);
    addVerified(
      finalizeEvent(
        { kind: 10002, created_at: 1, tags: [["r", "wss://peer-write.example", "write"]], content: "" },
        peerKey,
      ),
    );
    respondWith(dmRelayList([["relay", "wss://peer-dm.example"]], peerKey));

    expect(await peerDmRelays(peer)).toEqual(["wss://peer-dm.example/"]);
    expect(vi.mocked(requestOnce)).toHaveBeenCalledWith(
      [...READ, ...INDEXER_RELAYS, "wss://peer-write.example/"],
      [{ kinds: [10050], authors: [peer], limit: 1 }],
      PEER_DMRELAY_WAIT_MS,
    );
  });

  it("問い合わせても無い・応答が無ければ []", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    expect(await peerDmRelays(getPublicKey(generateSecretKey()))).toEqual([]);
    vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));
    expect(await peerDmRelays(getPublicKey(generateSecretKey()))).toEqual([]);
  });
});

describe("ownDmRelaysOrSeed（#478: 取り直してから・食い違えば発行しない）", () => {
  it("手元にあれば取り直さず・発行せずにそれを返す", async () => {
    addVerified(dmRelayList([["relay", "wss://mine.example"]]));
    expect(await ownDmRelaysOrSeed(me)).toEqual(["wss://mine.example/"]);
    expect(vi.mocked(requestOnce)).not.toHaveBeenCalled();
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("手元のリストが空なら発行せず []（本人が空にしているかもしれないので上書きしない）", async () => {
    addVerified(dmRelayList([]));
    expect(await ownDmRelaysOrSeed(me)).toEqual([]);
    expect(vi.mocked(requestOnce)).not.toHaveBeenCalled();
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("取り直しでどのリレーからも応答が無ければ発行せず []", async () => {
    vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));
    expect(await ownDmRelaysOrSeed(me)).toEqual([]);
    expect(vi.mocked(requestOnce)).toHaveBeenCalledWith(
      [...READ, ...WRITE, ...INDEXER_RELAYS],
      [{ kinds: [10050], authors: [me], limit: 1 }],
      OWN_DMRELAY_REFETCH_MS,
    );
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("取り直しでリストが見つかれば発行せず、そのリレーを返す（空なら []）", async () => {
    respondWith(dmRelayList([["relay", "wss://latest.example"]]));
    expect(await ownDmRelaysOrSeed(me)).toEqual(["wss://latest.example/"]);

    const otherKey = generateSecretKey();
    respondWith(dmRelayList([], otherKey));
    expect(await ownDmRelaysOrSeed(getPublicKey(otherKey))).toEqual([]);

    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("応答があって無ければ read の先頭 4 つで 1 回だけ発行し、2 回目は取り直しも発行もしない", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    const seed = READ.slice(0, 4).map((url) => `${url}/`);

    expect(await ownDmRelaysOrSeed(me)).toEqual(seed);
    expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publishEvent)).toHaveBeenCalledWith(
      { kind: 10050, content: "", tags: seed.map((url) => ["relay", url]) },
      { relays: [...new Set([...WRITE, ...INDEXER_RELAYS, ...seed])] },
    );

    expect(await ownDmRelaysOrSeed(me)).toEqual(seed);
    expect(vi.mocked(requestOnce)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
  });

  it("同時に 2 回呼んでも取り直し・発行は 1 回", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    const [a, b] = await Promise.all([ownDmRelaysOrSeed(me), ownDmRelaysOrSeed(me)]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(4);
    expect(vi.mocked(requestOnce)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
  });

  it("署名に失敗しても例外を投げず seed を返す（自分宛ての控えの送り先には使う）", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    vi.mocked(publishEvent).mockRejectedValueOnce(new PublishError("sign-failed"));
    expect(await ownDmRelaysOrSeed(me)).toHaveLength(4);
  });

  it("取り直しが同期で例外を投げても例外にせず []", async () => {
    vi.mocked(requestOnce).mockImplementation(() => {
      throw new Error("broken");
    });
    expect(await ownDmRelaysOrSeed(me)).toEqual([]);
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });
});

describe("isNip04OnlyPeer", () => {
  const PEER = "b".repeat(64);
  const ME = "c".repeat(64);
  function row(sender: string, proto: DmMessageRow["proto"], id: string): DmMessageRow {
    return { owner: ME, id, peer: PEER, sender, content: "", tags: [], createdAt: 1, proto };
  }

  it("相手からの NIP-04 があり NIP-17 が 1 つも無いときだけ true（自分の送信は数えない）", () => {
    expect(isNip04OnlyPeer([row(PEER, "nip04", "1")], PEER)).toBe(true);
    expect(isNip04OnlyPeer([row(PEER, "nip04", "1"), row(PEER, "nip17", "2")], PEER)).toBe(false);
    expect(isNip04OnlyPeer([row(ME, "nip04", "1")], PEER)).toBe(false);
    expect(isNip04OnlyPeer([row(PEER, "nip04", "1"), row(ME, "nip17", "2")], PEER)).toBe(true);
    expect(isNip04OnlyPeer([], PEER)).toBe(false);
  });
});
