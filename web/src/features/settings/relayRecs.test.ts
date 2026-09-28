import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, firstValueFrom } from "rxjs";
import { beforeEach, expect, it, vi } from "vitest";
import { requestOnce } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { aggregateRelayRecs, RECS_FOLLOW_LIMIT, relayRecs$ } from "./relayRecs";

// リレーには繋がない（取得は手元の EventStore の分で進む）
vi.mock("../../nostr/pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/pool")>()),
  requestOnce: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(requestOnce).mockReset();
  vi.mocked(requestOnce).mockReturnValue(EMPTY);
});

/** 署名なしの kind:10002（集計は tags と pubkey・created_at しか見ない） */
function relayList(pubkey: string, urls: string[], createdAt = 1_000): NostrEvent {
  return {
    id: `${pubkey}-${createdAt}`,
    pubkey,
    created_at: createdAt,
    kind: 10002,
    tags: urls.map((url) => ["r", url]),
    content: "",
    sig: "",
  };
}

it("使っている人の多い順に 12 件（件数つき）。同じ人数は URL 順、1 人 1 票、登録済みは除く", () => {
  // relay-00 は 14 人 … relay-13 は 1 人（14 件のうち上位 12 件）
  const lists: NostrEvent[] = [];
  for (let person = 0; person < 14; person++) {
    const urls: string[] = [];
    for (let r = 0; r <= 13 - person; r++) urls.push(`wss://relay-${String(r).padStart(2, "0")}.example`);
    // 同じ人の中で重複しても 1 票
    lists.push(relayList(`p${person}`, [...urls, urls[0]]));
  }
  // 同じ人数（1 人）の並びは URL 順
  lists.push(relayList("q1", ["wss://zzz.example"]));
  lists.push(relayList("q2", ["wss://aaa.example"]));

  const recs = aggregateRelayRecs(lists, new Set(["wss://relay-01.example/"]));
  expect(recs).toHaveLength(12);
  expect(recs.slice(0, 3)).toEqual([
    { url: "wss://relay-00.example/", count: 14 },
    { url: "wss://relay-02.example/", count: 12 },
    { url: "wss://relay-03.example/", count: 11 },
  ]);
  expect(recs.at(-1)).toEqual({ url: "wss://relay-12.example/", count: 2 });
  expect(recs.map((r) => r.url)).not.toContain("wss://relay-01.example/");

  const tail = aggregateRelayRecs(lists, new Set(), 100).slice(-3);
  expect(tail).toEqual([
    { url: "wss://aaa.example/", count: 1 },
    { url: "wss://relay-13.example/", count: 1 },
    { url: "wss://zzz.example/", count: 1 },
  ]);
});

it("同じ人の kind:10002 は最新の 1 件だけ数える", () => {
  const recs = aggregateRelayRecs(
    [
      relayList("a", ["wss://old.example"], 1),
      relayList("a", ["wss://new.example"], 2),
      relayList("b", ["wss://new.example"], 1),
    ],
    new Set(),
  );
  expect(recs).toEqual([{ url: "wss://new.example/", count: 2 }]);
});

it("relayRecs$: 自分の kind:3 のフォロー（先頭 300 人）の kind:10002 を取りに行き、手元の分で集計する", async () => {
  const meKey = generateSecretKey();
  const me = getPublicKey(meKey);
  const followKeys = [generateSecretKey(), generateSecretKey(), generateSecretKey()];
  const follows = followKeys.map((k) => getPublicKey(k));
  eventStore.add(
    finalizeEvent({ kind: 3, created_at: 1_000, tags: follows.map((p) => ["p", p]), content: "" }, meKey),
  );
  const lists = [
    ["wss://shared.example", "wss://mine.example"],
    ["wss://shared.example", "wss://solo.example"],
    ["wss://shared.example"],
  ];
  followKeys.forEach((key, i) => {
    eventStore.add(
      finalizeEvent(
        { kind: 10002, created_at: 1_000, tags: lists[i].map((url) => ["r", url]), content: "" },
        key,
      ),
    );
  });

  const recs = await firstValueFrom(relayRecs$(me, new Set(["wss://mine.example/"])));
  expect(recs).toEqual([
    { url: "wss://shared.example/", count: 3 },
    { url: "wss://solo.example/", count: 1 },
  ]);
  // kind:3 は手元にあるので取りに行かない。kind:10002 だけ
  expect(vi.mocked(requestOnce)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(requestOnce).mock.calls[0][1]).toEqual([{ kinds: [10002], authors: follows }]);
  expect(follows.length).toBeLessThanOrEqual(RECS_FOLLOW_LIMIT);
});

it("relayRecs$: 自分の kind:3 が無ければ取りに行き、それでも無ければ空（集計できない）", async () => {
  const me = getPublicKey(generateSecretKey());
  const recs = await firstValueFrom(relayRecs$(me, new Set()));
  expect(recs).toEqual([]);
  expect(vi.mocked(requestOnce)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(requestOnce).mock.calls[0][1]).toEqual([{ kinds: [3], authors: [me], limit: 1 }]);
});
