import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, Observable, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestOnce } from "../../nostr/pool";
import { PublishError, publishEvent } from "../../nostr/publish";
import { addVerified } from "../../nostr/store";
import {
  buildEmojiListTemplate,
  customEmojisFrom,
  EmojiListError,
  emojiSetPointers,
  parseEmojiShortcode,
  parseEmojiUrl,
  publishEmojiList,
} from "./customEmojis";

// リレーには繋がない（取り直しはテストごとに完了 / 失敗を返す）
vi.mock("../../nostr/pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/pool")>()),
  requestOnce: vi.fn(),
}));

// 署名・送信はしない
vi.mock("../../nostr/publish", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/publish")>()),
  publishEvent: vi.fn(async () => ({})),
}));

function event(kind: number, tags: string[][], createdAt = 1, content = ""): NostrEvent {
  return finalizeEvent({ kind, created_at: createdAt, tags, content }, generateSecretKey());
}

it("10030 直下が 30030 のセットより先勝ち、http:// は捨て、shortcode 昇順", () => {
  const list = event(10030, [
    ["emoji", "cat", "https://a/cat.png"],
    ["emoji", "old", "http://a/old.png"],
    ["emoji", " ", "https://a/blank.png"],
  ]);
  const set = event(30030, [
    ["d", "s"],
    ["emoji", "cat", "https://b/cat.png"],
    ["emoji", "bird", "https://b/bird.png"],
  ]);
  expect(customEmojisFrom(list, [set, undefined])).toEqual([
    { shortcode: "bird", url: "https://b/bird.png" },
    { shortcode: "cat", url: "https://a/cat.png" },
  ]);
});

it("emojiSetPointers: 30030 の a タグだけ。d は : を含んでよい、pubkey が空なら捨てる", () => {
  const list = event(10030, [
    ["a", "30030:pk:d:x"],
    ["a", "30030::d"],
    ["a", "30023:pk:d"],
  ]);
  expect(emojiSetPointers(list)).toEqual([{ kind: 30030, pubkey: "pk", identifier: "d:x" }]);
  expect(emojiSetPointers(undefined)).toEqual([]);
});

describe("追加欄の検証", () => {
  it("shortcode: 英数字と _ - だけ。前後の空白・: は落とす", () => {
    expect(parseEmojiShortcode(" :party_parrot-1: ")).toBe("party_parrot-1");
    expect(parseEmojiShortcode("")).toBeNull();
    expect(parseEmojiShortcode("has space")).toBeNull();
    expect(parseEmojiShortcode("日本語")).toBeNull();
  });

  it("url: https のみ", () => {
    expect(parseEmojiUrl(" https://e.example/cat.png ")).toBe("https://e.example/cat.png");
    expect(parseEmojiUrl("http://e.example/cat.png")).toBeNull();
    expect(parseEmojiUrl("not a url")).toBeNull();
  });
});

describe("buildEmojiListTemplate", () => {
  it("emoji タグだけ置き換え、a タグ等と content はそのまま。created_at は前の版より後", () => {
    const base = event(
      10030,
      [
        ["emoji", "old", "https://a/old.png"],
        ["a", "30030:pk:set"],
      ],
      2_000,
      "note",
    );
    expect(buildEmojiListTemplate(base, [{ shortcode: "cat", url: "https://a/cat.png" }], 1_000)).toEqual({
      kind: 10030,
      content: "note",
      tags: [
        ["emoji", "cat", "https://a/cat.png"],
        ["a", "30030:pk:set"],
      ],
      created_at: 2_001,
    });
    expect(buildEmojiListTemplate(null, [], 1_000)).toEqual({
      kind: 10030,
      content: "",
      tags: [],
      created_at: 1_000,
    });
  });
});

describe("publishEmojiList", () => {
  let key: Uint8Array;
  let me: string;

  beforeEach(() => {
    key = generateSecretKey();
    me = getPublicKey(key);
    vi.mocked(requestOnce).mockReset();
    vi.mocked(publishEvent).mockClear();
  });

  function list(tags: string[][], createdAt: number, content = ""): NostrEvent {
    return finalizeEvent({ kind: 10030, created_at: createdAt, tags, content }, key);
  }

  function refetchReturns(latest: NostrEvent | null) {
    vi.mocked(requestOnce).mockImplementation(() =>
      latest
        ? new Observable<NostrEvent>((subscriber) => {
            addVerified(latest, "wss://relay.example");
            subscriber.next(latest);
            subscriber.complete();
          })
        : EMPTY,
    );
  }

  it("どのリレーからも応答が無ければ発行しない（no-emoji-list。手元に版があっても）", async () => {
    addVerified(list([["emoji", "cat", "https://a/cat.png"]], 1_000));
    vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));

    const error = await publishEmojiList(me, [], null).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmojiListError);
    expect(error).toMatchObject({ reason: "no-emoji-list" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("編集を始めた時点の版と取り直した最新版が違えば発行しない（stale）", async () => {
    const shown = list([["emoji", "cat", "https://a/cat.png"]], 1_000);
    addVerified(shown);
    refetchReturns(list([["emoji", "dog", "https://a/dog.png"]], 2_000));

    const error = await publishEmojiList(me, [], shown.id).catch((e: unknown) => e);

    expect(error).toMatchObject({ name: "EmojiListError", reason: "stale" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("版が一致すれば、取り直した最新版の未知タグを保って発行する", async () => {
    const latest = list(
      [
        ["emoji", "cat", "https://a/cat.png"],
        ["a", "30030:pk:set"],
      ],
      2_000,
    );
    refetchReturns(latest);

    await publishEmojiList(me, [{ shortcode: "dog", url: "https://a/dog.png" }], latest.id);

    expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
    const draft = vi.mocked(publishEvent).mock.calls[0][0];
    expect(draft.tags).toEqual([
      ["emoji", "dog", "https://a/dog.png"],
      ["a", "30030:pk:set"],
    ]);
    expect(draft.created_at).toBeGreaterThan(2_000);
  });

  it("署名の失敗は同じ reason の EmojiListError", async () => {
    refetchReturns(null);
    vi.mocked(publishEvent).mockRejectedValueOnce(new PublishError("sign-failed"));
    await expect(publishEmojiList(me, [], null)).rejects.toMatchObject({
      name: "EmojiListError",
      reason: "sign-failed",
    });
  });
});
