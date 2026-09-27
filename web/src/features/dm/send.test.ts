import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import * as nip04 from "nostr-tools/nip04";
import { finalizeEvent, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type DmMessageRow, type NostrismDb } from "../../db/schema";
import { requestOnce, resetRelays, subscribeUnstored, useRelays } from "../../nostr/pool";
import { enqueueSigned, PublishError, publishEvent } from "../../nostr/publish";
import type { Signer } from "../../nostr/signer";
import { addVerified } from "../../nostr/store";
import { currentSigner, useSession } from "../../signer/session";
import { createCipherSigner } from "../../test/cipherSigner";
import { ownDmRelaysOrSeed } from "./dmRelays";
import { startDm } from "./dmService";
import { useDm } from "./dmStore";
import { unwrapGiftWrap } from "./nip17";
import { sendDm } from "./send";

// リレーには繋がない（取り直しは応答あり・該当なし。購読は流さない）
vi.mock("../../nostr/pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/pool")>()),
  requestOnce: vi.fn(),
  subscribeUnstored: vi.fn(),
}));

// 署名者はテストごとに決める
vi.mock("../../signer/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../signer/session")>()),
  currentSigner: vi.fn(),
}));

// 送信キューには積まない（入口だけ差し替える）
vi.mock("../../nostr/publish", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/publish")>()),
  enqueueSigned: vi.fn(),
  publishEvent: vi.fn(),
}));

// 自分の kind:10050 の seed は dmRelays.test.ts で見る
vi.mock("./dmRelays", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./dmRelays")>()),
  ownDmRelaysOrSeed: vi.fn(),
}));

const READ = ["wss://read.example/"];
const WRITE = ["wss://write.example/"];
const OWN_DM = ["wss://own-dm.example/"];
const asExtension = { decryptErrorIsInvalid: false };

let signer: Signer;
let me: string;
let myKey: Uint8Array;
let peer: ReturnType<typeof createCipherSigner>;
let database: NostrismDb;
const stops: (() => void)[] = [];
const databases: NostrismDb[] = [];

beforeEach(async () => {
  ({ signer, pubkey: me, secretKey: myKey } = createCipherSigner());
  peer = createCipherSigner();
  vi.mocked(currentSigner).mockImplementation(() => signer);
  vi.mocked(requestOnce).mockReset();
  vi.mocked(requestOnce).mockReturnValue(EMPTY);
  const feed = new Subject<NostrEvent | "EOSE">();
  vi.mocked(subscribeUnstored).mockReset();
  vi.mocked(subscribeUnstored).mockReturnValue(feed);
  vi.mocked(enqueueSigned).mockReset();
  vi.mocked(enqueueSigned).mockResolvedValue(undefined);
  vi.mocked(publishEvent).mockReset();
  vi.mocked(publishEvent).mockImplementation(async (draft) =>
    finalizeEvent({ ...draft, created_at: draft.created_at ?? 1_800_000_000 }, myKey),
  );
  vi.mocked(ownDmRelaysOrSeed).mockReset();
  vi.mocked(ownDmRelaysOrSeed).mockResolvedValue(OWN_DM);
  useRelays.setState({ read: READ, write: WRITE, source: "nip65" }, true);

  // DM を動かす（楽観表示の保存先）
  useSession.setState({ status: "in", method: "nip07", pubkey: me });
  database = createDatabase({
    name: `send-${crypto.randomUUID()}`,
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  });
  await database.open();
  databases.push(database);
  stops.push(startDm({ database }));
  await vi.waitFor(() => expect(vi.mocked(subscribeUnstored)).toHaveBeenCalled());
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  useSession.setState({ status: "loading", method: null, pubkey: null });
  useDm.getState().reset(null);
  resetRelays();
  for (const d of databases.splice(0)) d.close();
});

function publishDmRelays(key: Uint8Array, urls: string[]) {
  addVerified(
    finalizeEvent({ kind: 10050, created_at: 1_000, tags: urls.map((u) => ["relay", u]), content: "" }, key),
  );
}

/** 相手の kind:10002（read と write を 1 つずつ） */
function publishPeerRelayList() {
  addVerified(
    finalizeEvent(
      {
        kind: 10002,
        created_at: 1_000,
        tags: [
          ["r", "wss://peer-read.example", "read"],
          ["r", "wss://peer-write.example", "write"],
        ],
        content: "",
      },
      peer.secretKey,
    ),
  );
}

function messages(): DmMessageRow[] {
  return Object.values(useDm.getState().messages);
}

function enqueued(): {
  event: NostrEvent;
  relays: readonly string[];
  refId: string | null;
  notify: boolean;
}[] {
  return vi.mocked(enqueueSigned).mock.calls.map(([event, opts]) => ({ event, ...opts }));
}

describe("NIP-17", () => {
  it("相手に kind:10050 がある → 相手宛てを相手の DM リレーへ、自分宛ての控えを自分の DM リレーへ積んで sent", async () => {
    publishDmRelays(peer.secretKey, ["wss://peer-dm.example"]);

    expect(await sendDm(peer.pubkey, "こんにちは")).toBe("sent");

    const [toPeer, toSelf] = enqueued();
    expect(enqueued()).toHaveLength(2);
    const rumor = await unwrapGiftWrap(peer.signer, toPeer.event, asExtension);
    expect(rumor).toMatchObject({ pubkey: me, kind: 14, tags: [["p", peer.pubkey]], content: "こんにちは" });
    expect(toPeer).toMatchObject({ relays: ["wss://peer-dm.example/"], refId: rumor.id, notify: true });
    expect(await unwrapGiftWrap(signer, toSelf.event, asExtension)).toEqual(rumor);
    expect(toSelf).toMatchObject({ relays: OWN_DM, refId: null, notify: false });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();

    // 楽観表示と保存。送った gift wrap は処理済み（返ってきても復号しない）
    expect(messages()).toEqual([
      {
        owner: me,
        id: rumor.id,
        peer: peer.pubkey,
        sender: me,
        content: "こんにちは",
        tags: [["p", peer.pubkey]],
        createdAt: rumor.created_at,
        proto: "nip17",
      },
    ]);
    await vi.waitFor(async () => {
      expect(await database.dmMessages.get([me, rumor.id])).toMatchObject({ content: "こんにちは" });
      expect(await database.dmProcessed.get([me, toPeer.event.id])).toMatchObject({ ok: true });
      expect(await database.dmProcessed.get([me, toSelf.event.id])).toMatchObject({ ok: true });
    });
  });

  it("相手に kind:10050 も NIP-04 の履歴も無い → 自分の read + 相手の read へ送って sent-no-peer-relays", async () => {
    publishPeerRelayList();

    expect(await sendDm(peer.pubkey, "届く？")).toBe("sent-no-peer-relays");

    expect(enqueued().map((c) => c.relays)).toEqual([[...READ, "wss://peer-read.example/"], OWN_DM]);
    expect(vi.mocked(requestOnce)).toHaveBeenCalledWith(
      expect.arrayContaining(["wss://peer-write.example/"]),
      [{ kinds: [10050], authors: [peer.pubkey], limit: 1 }],
      expect.any(Number),
    );
  });

  it("自分の DM リレーが無ければ自分宛ての控えは read リレーへ", async () => {
    vi.mocked(ownDmRelaysOrSeed).mockResolvedValue([]);
    publishDmRelays(peer.secretKey, ["wss://peer-dm.example"]);
    expect(await sendDm(peer.pubkey, "x")).toBe("sent");
    expect(enqueued()[1].relays).toEqual(READ);
  });

  it("自分宛て（peer = 自分）は 1 通だけ積む", async () => {
    expect(await sendDm(me, "メモ")).toBe("sent-no-peer-relays");
    expect(enqueued()).toHaveLength(1);
    const rumor = await unwrapGiftWrap(signer, enqueued()[0].event, asExtension);
    expect(rumor).toMatchObject({ content: "メモ", tags: [["p", me]] });
    expect(enqueued()[0]).toMatchObject({ relays: READ, refId: rumor.id, notify: true });
    expect(messages()).toMatchObject([{ peer: me, sender: me, content: "メモ" }]);
  });

  it("NIP-44 の無い署名者で NIP-17 になる相手 → no-nip44 で何も積まず、表示もしない", async () => {
    signer = createCipherSigner({ nip44: false }).signer;
    publishDmRelays(peer.secretKey, ["wss://peer-dm.example"]);
    expect(await sendDm(peer.pubkey, "x")).toBe("no-nip44");
    expect(vi.mocked(enqueueSigned)).not.toHaveBeenCalled();
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
    expect(messages()).toEqual([]);
  });

  it("wrap で例外 → failed。何も積まず、表示も残さない", async () => {
    const inner = signer.nip44;
    signer.nip44 = {
      encrypt: async () => {
        throw new Error("rejected");
      },
      decrypt: inner?.decrypt ?? (async () => ""),
    };
    publishDmRelays(peer.secretKey, ["wss://peer-dm.example"]);
    expect(await sendDm(peer.pubkey, "x")).toBe("failed");
    expect(vi.mocked(enqueueSigned)).not.toHaveBeenCalled();
    expect(messages()).toEqual([]);
  });

  it("楽観表示の後、積む前の例外 → 表示と保存を消して failed", async () => {
    vi.mocked(ownDmRelaysOrSeed).mockRejectedValueOnce(new Error("unexpected"));
    publishDmRelays(peer.secretKey, ["wss://peer-dm.example"]);

    expect(await sendDm(peer.pubkey, "消える")).toBe("failed");

    expect(vi.mocked(enqueueSigned)).not.toHaveBeenCalled();
    expect(messages()).toEqual([]);
    await vi.waitFor(async () => expect(await database.dmMessages.count()).toBe(0));
  });

  it("相手宛ての 1 通目を積めなければ表示を消して failed、積んだ後の例外では消さない", async () => {
    publishDmRelays(peer.secretKey, ["wss://peer-dm.example"]);
    vi.mocked(enqueueSigned).mockRejectedValueOnce(new PublishError("no-signer"));
    expect(await sendDm(peer.pubkey, "1 通目")).toBe("failed");
    expect(messages()).toEqual([]);

    vi.mocked(enqueueSigned)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new PublishError("no-signer"));
    expect(await sendDm(peer.pubkey, "2 通目")).toBe("failed");
    expect(messages()).toMatchObject([{ content: "2 通目" }]);
  });
});

describe("NIP-04", () => {
  function receivedNip04() {
    useDm.getState().upsertMessages([
      {
        owner: me,
        id: "legacy",
        peer: peer.pubkey,
        sender: peer.pubkey,
        content: "old",
        tags: [["p", me]],
        createdAt: 1,
        proto: "nip04",
      },
    ]);
  }

  it("相手に kind:10050 が無く NIP-04 の受信しか無い → kind:4 を write + 相手の read へ発行して sent", async () => {
    publishPeerRelayList();
    receivedNip04();

    expect(await sendDm(peer.pubkey, "返信")).toBe("sent");

    expect(vi.mocked(enqueueSigned)).not.toHaveBeenCalled();
    expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
    const [draft, opts] = vi.mocked(publishEvent).mock.calls[0];
    expect(draft).toMatchObject({ kind: 4, tags: [["p", peer.pubkey]] });
    expect(draft.content).not.toContain("返信");
    expect(nip04.decrypt(peer.secretKey, me, draft.content)).toBe("返信");
    expect(opts?.relays).toEqual([...WRITE, "wss://peer-read.example/"]);

    const signed = await vi.mocked(publishEvent).mock.results[0].value;
    expect(messages().find((m) => m.id === signed.id)).toEqual({
      owner: me,
      id: signed.id,
      peer: peer.pubkey,
      sender: me,
      content: "返信",
      tags: [["p", peer.pubkey]],
      createdAt: signed.created_at,
      proto: "nip04",
    });
    await vi.waitFor(async () =>
      expect(await database.dmProcessed.get([me, signed.id])).toMatchObject({ ok: true }),
    );
  });

  it("相手が NIP-17 も使っていれば NIP-04 にしない", async () => {
    receivedNip04();
    useDm.getState().upsertMessages([{ ...messages()[0], id: "modern", proto: "nip17" }]);
    expect(await sendDm(peer.pubkey, "x")).toBe("sent-no-peer-relays");
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("NIP-04 の無い署名者 → no-nip04。発行の失敗 → failed（表示しない）", async () => {
    receivedNip04();
    signer = createCipherSigner({ nip04: false }).signer;
    expect(await sendDm(peer.pubkey, "x")).toBe("no-nip04");

    signer = createCipherSigner().signer;
    vi.mocked(publishEvent).mockRejectedValueOnce(new PublishError("sign-failed"));
    expect(await sendDm(peer.pubkey, "x")).toBe("failed");
    expect(messages().map((m) => m.id)).toEqual(["legacy"]);
  });
});

it("未ログイン・空白だけの本文は failed で何もしない", async () => {
  expect(await sendDm(peer.pubkey, "  \n ")).toBe("failed");
  vi.mocked(currentSigner).mockImplementation(() => null);
  expect(await sendDm(peer.pubkey, "x")).toBe("failed");
  // 相手の kind:10050 も取りに行かない（起動時の自分の kind:10050 の取得は dmService）
  const peerFetches = vi
    .mocked(requestOnce)
    .mock.calls.filter(([, filters]) => filters[0].authors?.includes(peer.pubkey));
  expect(peerFetches).toEqual([]);
  expect(vi.mocked(enqueueSigned)).not.toHaveBeenCalled();
  expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
});
