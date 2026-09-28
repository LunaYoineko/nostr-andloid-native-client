import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, firstValueFrom } from "rxjs";
import { beforeEach, expect, it, vi } from "vitest";
import { requestOnce } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { aggregateDmRelayRecs, DMRELAY_RECS_FOLLOW_LIMIT, dmRelayRecs$ } from "./dmRelayRecs";

// リレーには繋がない（取得は手元の EventStore の分で進む）
vi.mock("../../nostr/pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/pool")>()),
  requestOnce: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(requestOnce).mockReset();
  vi.mocked(requestOnce).mockReturnValue(EMPTY);
});

/** 署名なしの kind:10050（集計は tags と pubkey・created_at しか見ない） */
function dmRelayList(pubkey: string, urls: string[], createdAt = 1_000): NostrEvent {
  return {
    id: `${pubkey}-${createdAt}`,
    pubkey,
    created_at: createdAt,
    kind: 10050,
    tags: urls.map((url) => ["relay", url]),
    content: "",
    sig: "",
  };
}

it("使っている人の多い順に 12 件（件数つき）。同じ人数は URL 順、1 人 1 票、登録済みは除く", () => {
  const lists: NostrEvent[] = [];
  for (let person = 0; person < 14; person++) {
    const urls: string[] = [];
    for (let r = 0; r <= 13 - person; r++) urls.push(`wss://relay-${String(r).padStart(2, "0")}.example`);
    lists.push(dmRelayList(`p${person}`, [...urls, urls[0]]));
  }
  lists.push(dmRelayList("q1", ["wss://zzz.example"]));
  lists.push(dmRelayList("q2", ["wss://aaa.example"]));

  const recs = aggregateDmRelayRecs(lists, new Set(["wss://relay-01.example/"]));
  expect(recs).toHaveLength(12);
  expect(recs.slice(0, 3)).toEqual([
    { url: "wss://relay-00.example/", count: 14 },
    { url: "wss://relay-02.example/", count: 12 },
    { url: "wss://relay-03.example/", count: 11 },
  ]);
  expect(recs.at(-1)).toEqual({ url: "wss://relay-12.example/", count: 2 });
  expect(recs.map((r) => r.url)).not.toContain("wss://relay-01.example/");
});

it("同じ人の kind:10050 は最新の 1 件だけ数える", () => {
  const recs = aggregateDmRelayRecs(
    [
      dmRelayList("a", ["wss://old.example"], 1),
      dmRelayList("a", ["wss://new.example"], 2),
      dmRelayList("b", ["wss://new.example"], 1),
    ],
    new Set(),
  );
  expect(recs).toEqual([{ url: "wss://new.example/", count: 2 }]);
});

it("dmRelayRecs$: 自分の kind:3 のフォロー（先頭 300 人）の kind:10050 を取りに行き、手元の分で集計する", async () => {
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
        { kind: 10050, created_at: 1_000, tags: lists[i].map((url) => ["relay", url]), content: "" },
        key,
      ),
    );
  });

  const recs = await firstValueFrom(dmRelayRecs$(me, new Set(["wss://mine.example/"])));
  expect(recs).toEqual([
    { url: "wss://shared.example/", count: 3 },
    { url: "wss://solo.example/", count: 1 },
  ]);
  // kind:3 は手元にあるので取りに行かない。kind:10050 だけ
  expect(vi.mocked(requestOnce)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(requestOnce).mock.calls[0][1]).toEqual([{ kinds: [10050], authors: follows }]);
  expect(follows.length).toBeLessThanOrEqual(DMRELAY_RECS_FOLLOW_LIMIT);
});

it("dmRelayRecs$: 自分の kind:3 が無ければ取りに行き、それでも無ければ空（集計できない）", async () => {
  const me = getPublicKey(generateSecretKey());
  const recs = await firstValueFrom(dmRelayRecs$(me, new Set()));
  expect(recs).toEqual([]);
  expect(vi.mocked(requestOnce)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(requestOnce).mock.calls[0][1]).toEqual([{ kinds: [3], authors: [me], limit: 1 }]);
});
