import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, Observable, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestOnce } from "../../nostr/pool";
import { PublishError, publishEvent } from "../../nostr/publish";
import { addVerified } from "../../nostr/store";
import {
  buildPinnedHashtagsTemplate,
  normalizeHashtag,
  PinnedHashtagsError,
  pinLimitMessage,
  publishPinnedHashtags,
  togglePinnedHashtag,
} from "./pinnedHashtags";

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

let key: Uint8Array;
let me: string;

beforeEach(() => {
  key = generateSecretKey();
  me = getPublicKey(key);
  vi.mocked(requestOnce).mockReset();
  vi.mocked(publishEvent).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function pinnedEvent(tags: string[][], createdAt: number, content = ""): NostrEvent {
  return finalizeEvent(
    { kind: 30015, created_at: createdAt, tags: [["d", "pinned"], ...tags], content },
    key,
  );
}

/** 取り直しで latest が届く（リレーは応答する） */
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

it("normalizeHashtag: 前後空白・先頭 # を除き小文字。文字・数字・_ 以外は null", () => {
  expect(normalizeHashtag("#Nostr ")).toBe("nostr");
  expect(normalizeHashtag(" #日本語_1 ")).toBe("日本語_1");
  expect(normalizeHashtag("a b")).toBeNull();
  expect(normalizeHashtag("")).toBeNull();
  expect(normalizeHashtag("#")).toBeNull();
});

it("pinLimitMessage: 件数入りの案内", () => {
  expect(pinLimitMessage(15)).toBe("ピン留めは15件までです。整理画面で整理してください。");
});

describe("buildPinnedHashtagsTemplate", () => {
  it("d/t 以外のタグと content を保ち、t を表示順で置き換える。created_at は前の版より後", () => {
    const base = pinnedEvent(
      [
        ["t", "old"],
        ["client", "other"],
        ["x", "unknown", "value"],
      ],
      2_000,
      "note",
    );
    expect(buildPinnedHashtagsTemplate(base, ["nostr", "zap"], 1_000)).toEqual({
      kind: 30015,
      content: "note",
      tags: [
        ["d", "pinned"],
        ["t", "nostr"],
        ["t", "zap"],
        ["client", "other"],
        ["x", "unknown", "value"],
      ],
      created_at: 2_001,
    });
  });

  it("15 件を超える分は切り詰める", () => {
    const tags = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const template = buildPinnedHashtagsTemplate(null, tags, 1_000);
    expect(template.tags.filter((t) => t[0] === "t")).toHaveLength(15);
  });
});

describe("publishPinnedHashtags（整理画面の保存）", () => {
  it("どのリレーからも応答が無ければ発行しない（no-pinned-list。手元に版があっても）", async () => {
    addVerified(pinnedEvent([["t", "nostr"]], 1_000));
    vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));

    const error = await publishPinnedHashtags(me, ["nostr"], null).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PinnedHashtagsError);
    expect(error).toMatchObject({ reason: "no-pinned-list" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("編集を始めた時点の版と取り直した最新版が違えば発行しない（stale）", async () => {
    const shown = pinnedEvent([["t", "nostr"]], 1_000);
    addVerified(shown);
    refetchReturns(pinnedEvent([["t", "zap"]], 2_000));

    const error = await publishPinnedHashtags(me, ["nostr", "zap"], shown.id).catch((e: unknown) => e);

    expect(error).toMatchObject({ name: "PinnedHashtagsError", reason: "stale" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("版が一致すれば、取り直した最新版の未知タグ・content を保って発行する", async () => {
    const latest = pinnedEvent(
      [
        ["t", "nostr"],
        ["x", "unknown"],
      ],
      2_000,
      "note",
    );
    refetchReturns(latest);

    await publishPinnedHashtags(me, ["zap", "nostr"], latest.id);

    expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
    const draft = vi.mocked(publishEvent).mock.calls[0][0];
    expect(draft.tags).toEqual([
      ["d", "pinned"],
      ["t", "zap"],
      ["t", "nostr"],
      ["x", "unknown"],
    ]);
    expect(draft.content).toBe("note");
    expect(draft.created_at).toBeGreaterThan(2_000);
  });

  it("署名の失敗は同じ reason の PinnedHashtagsError", async () => {
    refetchReturns(null);
    vi.mocked(publishEvent).mockRejectedValueOnce(new PublishError("sign-failed"));
    await expect(publishPinnedHashtags(me, ["nostr"], null)).rejects.toMatchObject({
      name: "PinnedHashtagsError",
      reason: "sign-failed",
    });
  });
});

describe("togglePinnedHashtag（投稿シートのチップの長押し / 右クリック）", () => {
  it("どのリレーからも応答が無ければ発行しない", async () => {
    vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));
    await expect(togglePinnedHashtag(me, "nostr", true)).rejects.toMatchObject({ reason: "no-pinned-list" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("最新版で既に同じ状態なら noop（別の端末で同じ操作が済んでいた）", async () => {
    refetchReturns(pinnedEvent([["t", "nostr"]], 1_000));
    expect(await togglePinnedHashtag(me, "nostr", true)).toBe("noop");
    expect(await togglePinnedHashtag(me, "zap", false)).toBe("noop");
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("ピン留め済みで PINNED_MAX なら limit（発行しない）", async () => {
    const tags = Array.from({ length: 15 }, (_, i) => ["t", `t${i}`]);
    refetchReturns(pinnedEvent(tags, 1_000));
    expect(await togglePinnedHashtag(me, "new", true)).toBe("limit");
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("それ以外は最新版に 1 件だけ足した（外した）タグで発行し、未知タグと content が残る", async () => {
    const latest = pinnedEvent(
      [
        ["t", "nostr"],
        ["x", "unknown"],
      ],
      2_000,
      "note",
    );
    refetchReturns(latest);

    expect(await togglePinnedHashtag(me, "zap", true)).toBe("done");
    let draft = vi.mocked(publishEvent).mock.calls[0][0];
    expect(draft.tags).toEqual([
      ["d", "pinned"],
      ["t", "nostr"],
      ["t", "zap"],
      ["x", "unknown"],
    ]);
    expect(draft.content).toBe("note");

    vi.mocked(publishEvent).mockClear();
    expect(await togglePinnedHashtag(me, "nostr", false)).toBe("done");
    draft = vi.mocked(publishEvent).mock.calls[0][0];
    expect(draft.tags).toEqual([
      ["d", "pinned"],
      ["x", "unknown"],
    ]);
  });
});
