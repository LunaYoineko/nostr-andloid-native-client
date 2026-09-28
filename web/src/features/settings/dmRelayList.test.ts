import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, Observable, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { OWN_REPLACEABLE_REFETCH_MS } from "../../nostr/ownReplaceable";
import { defaultRelaysFor, requestOnce, resetRelays } from "../../nostr/pool";
import { PublishError, publishEvent } from "../../nostr/publish";
import { addVerified } from "../../nostr/store";
import {
  buildDmRelayListTemplate,
  DM_RELAY_SEED_COUNT,
  DmRelayListError,
  dmRelaysFromReads,
  publishDmRelayList,
} from "./dmRelayList";

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

const DEFAULTS = defaultRelaysFor(navigator.language ?? "");

let key: Uint8Array;
let me: string;

beforeEach(() => {
  key = generateSecretKey();
  me = getPublicKey(key);
  vi.mocked(requestOnce).mockReset();
  vi.mocked(publishEvent).mockClear();
  localStorage.clear();
  resetRelays();
});

afterEach(() => {
  resetRelays();
});

function dmRelayList(tags: string[][], createdAt: number, content = ""): NostrEvent {
  return finalizeEvent({ kind: 10050, created_at: createdAt, tags, content }, key);
}

describe("dmRelaysFromReads", () => {
  it("先頭 DM_RELAY_SEED_COUNT 件を正規化して重複除去、wss:// 以外は弾く", () => {
    expect(
      dmRelaysFromReads([
        "wss://a.example",
        "wss://a.example/",
        "ws://b.example",
        "wss://c.example",
        "wss://d.example",
        "wss://e.example",
        "wss://f.example",
      ]),
    ).toEqual(["wss://a.example/", "wss://c.example/", "wss://d.example/", "wss://e.example/"]);
    expect(dmRelaysFromReads(["wss://a.example", "wss://a.example"])).toEqual(["wss://a.example/"]);
    expect(DM_RELAY_SEED_COUNT).toBe(4);
  });
});

describe("buildDmRelayListTemplate", () => {
  it("取り直した版の relay 以外のタグと content を残し、relay だけ置き換える。created_at は前の版より後", () => {
    const base = dmRelayList(
      [
        ["relay", "wss://old.example"],
        ["client", "other"],
        ["x", "unknown", "value"],
      ],
      2_000,
      "note",
    );
    expect(buildDmRelayListTemplate(base, ["wss://new.example/", "wss://new.example/"], 1_000)).toEqual({
      kind: 10050,
      content: "note",
      tags: [
        ["relay", "wss://new.example/"],
        ["client", "other"],
        ["x", "unknown", "value"],
      ],
      created_at: 2_001,
    });
    expect(buildDmRelayListTemplate(null, [], 1_000)).toEqual({
      kind: 10050,
      content: "",
      tags: [],
      created_at: 1_000,
    });
  });
});

describe("publishDmRelayList", () => {
  const urls = ["wss://a.example/", "wss://b.example/"];

  it("どのリレーからも応答が無ければ発行せず no-relay-list（手元に版があっても）", async () => {
    addVerified(dmRelayList([["relay", "wss://cached.example"]], 1_000));
    vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));

    const error = await publishDmRelayList(me, urls, null).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DmRelayListError);
    expect(error).toMatchObject({ reason: "no-relay-list" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("直前に取り直した最新版の未知タグを保って発行し、write・インデクサ・新しい DM リレーへ送る", async () => {
    addVerified(dmRelayList([["relay", "wss://cached.example"]], 1_000));
    const latest = dmRelayList(
      [
        ["relay", "wss://latest.example"],
        ["x", "keep"],
      ],
      2_000,
    );
    vi.mocked(requestOnce).mockImplementation(
      () =>
        new Observable<NostrEvent>((subscriber) => {
          addVerified(latest, "wss://indexer.example");
          subscriber.next(latest);
          subscriber.complete();
        }),
    );

    // 画面は取り直した最新版を見て編集していた
    await publishDmRelayList(me, urls, latest.id);

    expect(vi.mocked(requestOnce)).toHaveBeenCalledWith(
      [...new Set([...DEFAULTS, ...INDEXER_RELAYS])],
      [{ kinds: [10050], authors: [me], limit: 1 }],
      OWN_REPLACEABLE_REFETCH_MS,
    );
    expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
    const [draft, opts] = vi.mocked(publishEvent).mock.calls[0];
    expect(draft).toMatchObject({
      kind: 10050,
      tags: [
        ["relay", "wss://a.example/"],
        ["relay", "wss://b.example/"],
        ["x", "keep"],
      ],
      created_at: expect.any(Number),
    });
    expect(draft.created_at).toBeGreaterThan(2_000);
    expect(opts?.relays).toEqual([...new Set([...DEFAULTS, ...INDEXER_RELAYS, ...urls])]);
  });

  it("応答はあったが kind:10050 が無ければ新しく作って発行する", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    await publishDmRelayList(me, urls, null);
    expect(vi.mocked(publishEvent).mock.calls[0][0].tags).toEqual([
      ["relay", "wss://a.example/"],
      ["relay", "wss://b.example/"],
    ]);
  });

  it("署名に失敗したら同じ reason の DmRelayListError", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    vi.mocked(publishEvent).mockRejectedValueOnce(new PublishError("sign-failed"));

    const error = await publishDmRelayList(me, urls, null).catch((e: unknown) => e);

    expect(error).toMatchObject({ name: "DmRelayListError", reason: "sign-failed" });
  });

  it("編集を始めた時点の版と取り直した最新版が違えば発行せず stale（読み込み前でも）", async () => {
    const cached = dmRelayList([["relay", "wss://cached.example"]], 1_000);
    addVerified(cached);
    const latest = dmRelayList([["relay", "wss://latest.example"]], 2_000);
    vi.mocked(requestOnce).mockImplementation(
      () =>
        new Observable<NostrEvent>((subscriber) => {
          addVerified(latest, "wss://indexer.example");
          subscriber.next(latest);
          subscriber.complete();
        }),
    );

    const fromCached = await publishDmRelayList(me, urls, cached.id).catch((e: unknown) => e);
    const fromNothing = await publishDmRelayList(me, urls, null).catch((e: unknown) => e);

    expect(fromCached).toMatchObject({ name: "DmRelayListError", reason: "stale" });
    expect(fromNothing).toMatchObject({ name: "DmRelayListError", reason: "stale" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });
});
