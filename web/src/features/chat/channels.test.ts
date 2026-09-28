import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeDeckColumns, encodeDeckColumns, roomColumnFor } from "../../lib/columns";
import {
  CHANNELS_ENDPOINT,
  parseChannels,
  refreshChannels,
  resetChannelsForTest,
  useChannels,
} from "./channels";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const E = "e".repeat(64);

/** thread.nchan.vip/channels の応答（固定。実際の形: content は JSON 文字列、時刻は数値） */
const FIXTURE = {
  data: [
    {
      id: A,
      author: "1".repeat(64),
      name: "外側の名前 A",
      content: JSON.stringify({
        name: "さびれたスナック",
        about: "酔っ払いが問わず語り\nしてたり",
        picture: "https://image.example/a.webp",
        relays: ["wss://yabu.me/", "wss://relay-jp.example/"],
      }),
      latest_update: 1_790_548_798,
      created_at: 1_786_826_875,
    },
    // content が壊れている → name は外側
    { id: B, name: "壊れた content", content: "{not json", latest_update: 1_790_600_000, created_at: 1 },
    // content の name が空 → 外側、latest_update が無い → created_at、picture が空 → 無し
    {
      id: C,
      name: "外側の名前 C",
      content: JSON.stringify({ name: " ", about: "説明 C", picture: "" }),
      created_at: 1_790_000_000,
    },
    // 時刻は文字列でも読む（同じ時刻は応答の順）
    { id: D, content: JSON.stringify({ name: "D" }), latest_update: "1790548798", created_at: "1" },
    // id が無い行・オブジェクトでない行は捨てる
    { name: "id なし", content: "{}" },
    "broken",
    { id: E, content: JSON.stringify({ name: "E" }), latest_update: 10, created_at: 5 },
  ],
};

afterEach(() => {
  resetChannelsForTest();
  vi.restoreAllMocks();
});

describe("parseChannels", () => {
  it("nchan の応答 → 一覧の項目（ネイティブ refreshChannels と同じ読み方）と最終更新の新しい順", () => {
    const channels = parseChannels(FIXTURE);
    expect(channels?.map((c) => c.id)).toEqual([B, A, D, C, E]);
    expect(channels?.find((c) => c.id === A)).toEqual({
      id: A,
      name: "さびれたスナック",
      about: "酔っ払いが問わず語り\nしてたり",
      picture: "https://image.example/a.webp",
      relays: ["wss://yabu.me/", "wss://relay-jp.example/"],
      createdAt: 1_786_826_875,
      lastAt: 1_790_548_798,
    });
    expect(channels?.find((c) => c.id === D)).toMatchObject({
      name: "D",
      createdAt: 1,
      lastAt: 1_790_548_798,
    });
  });

  it("壊れた content の行は name を外側から取る（説明・画像・リレーは無し）", () => {
    const b = parseChannels(FIXTURE)?.find((c) => c.id === B);
    expect(b).toEqual({
      id: B,
      name: "壊れた content",
      about: "",
      picture: null,
      relays: [],
      createdAt: 1,
      lastAt: 1_790_600_000,
    });
  });

  it("content の name が空なら外側。latest_update が無ければ created_at、空の picture は無し", () => {
    const c = parseChannels(FIXTURE)?.find((ch) => ch.id === C);
    expect(c).toMatchObject({ name: "外側の名前 C", about: "説明 C", picture: null, lastAt: 1_790_000_000 });
  });

  it("名前がどこにも無ければ空。同じ id は後の行で上書き", () => {
    const channels = parseChannels({
      data: [
        { id: A, content: "{}", latest_update: 1 },
        { id: A, content: JSON.stringify({ name: "後" }), latest_update: 2 },
        { id: B, content: "{}", latest_update: 3 },
      ],
    });
    expect(channels?.map((c) => [c.id, c.name])).toEqual([
      [B, ""],
      [A, "後"],
    ]);
  });

  it("data が無い・配列でなければ null", () => {
    expect(parseChannels({})).toBeNull();
    expect(parseChannels({ data: {} })).toBeNull();
    expect(parseChannels(null)).toBeNull();
  });
});

describe("refreshChannels", () => {
  it("同一オリジンの /api/nchan/channels を取り、一覧を入れる", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(FIXTURE)));
    await refreshChannels(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      CHANNELS_ENDPOINT,
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(CHANNELS_ENDPOINT).toBe("/api/nchan/channels");
    expect(useChannels.getState().channels?.map((c) => c.id)).toEqual([B, A, D, C, E]);
    expect(useChannels.getState().failed).toBe(false);
  });

  it("失敗しても前の一覧は残し、failed にする", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await refreshChannels(async () => new Response(JSON.stringify(FIXTURE)));
    await refreshChannels(async () => new Response("upstream", { status: 502 }));
    expect(useChannels.getState().channels).toHaveLength(5);
    expect(useChannels.getState()).toMatchObject({ loading: false, failed: true });
  });

  it("取得中にもう一度呼んでも 1 回だけ取る", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(FIXTURE)));
    await Promise.all([refreshChannels(fetchImpl), refreshChannels(fetchImpl)]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("roomColumnFor", () => {
  it("ネイティブ SampleData.roomColumnFor と同じ spec。保存・同期の JSON はネイティブとバイト一致", () => {
    const [a] = parseChannels(FIXTURE)?.filter((c) => c.id === A) ?? [];
    const spec = roomColumnFor(a);
    expect(spec).toMatchObject({
      id: `room_${A}`,
      title: "さびれたスナック",
      subtitle: "酔っ払いが問わず語り\nしてたり",
      kind: "CHANNEL_ROOM",
      renderer: "ROOM",
      pinned: false,
      order: 100,
    });
    expect(encodeDeckColumns([{ ...spec, pinned: true }])).toBe(
      `[{"id":"room_${A}","title":"さびれたスナック","subtitle":"酔っ払いが問わず語り\\nしてたり","kind":"CHANNEL_ROOM","renderer":"ROOM","filter":{"kinds":[42],"channelId":"${A}"}}]`,
    );
  });

  it("説明が空なら subtitle は「NIP-28 · kind:42」。ネイティブが同期したカラムと同じ値に読める", () => {
    const spec = roomColumnFor({ id: B, name: "B", about: " " });
    expect(spec.subtitle).toBe("NIP-28 · kind:42");
    const native = `[{"id":"room_${B}","title":"B","subtitle":"NIP-28 · kind:42","kind":"CHANNEL_ROOM","renderer":"ROOM","filter":{"kinds":[42],"channelId":"${B}"}}]`;
    expect(decodeDeckColumns(native)).toEqual([{ ...spec, pinned: true, order: 0 }]);
  });
});
