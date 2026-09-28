import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, Observable, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { OWN_REPLACEABLE_REFETCH_MS } from "../../nostr/ownReplaceable";
import { defaultRelaysFor, requestOnce, resetRelays } from "../../nostr/pool";
import { PublishError, publishEvent } from "../../nostr/publish";
import { addVerified } from "../../nostr/store";
import {
  buildChannelCreateTemplate,
  buildChannelEditTemplate,
  ChannelEditError,
  latestOwnChannelMeta,
  publishChannelEdit,
  publishNewChannel,
} from "./channelEdit";

// リレーには繋がない（取り直しはテストごとに完了 / 失敗を返す）
vi.mock("../../nostr/pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/pool")>()),
  requestOnce: vi.fn(),
}));

// 署名・送信はしない（publishEvent だけ差し替えて draft を見る）
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

function channelEvent(kind: 40 | 41, tags: string[][], createdAt: number, content: unknown): NostrEvent {
  return finalizeEvent({ kind, created_at: createdAt, tags, content: JSON.stringify(content) }, key);
}

const FIELDS = { name: "さびれたスナック", about: "酔っ払いが問わず語り", picture: "" };

describe("buildChannelCreateTemplate", () => {
  it("kind:40。picture が空ならキーが無い、タグは無し", () => {
    expect(buildChannelCreateTemplate(FIELDS, 1_000)).toEqual({
      kind: 40,
      content: JSON.stringify({ name: FIELDS.name, about: FIELDS.about }),
      tags: [],
      created_at: 1_000,
    });
  });

  it("picture があればキーに入れる", () => {
    const withPicture = { ...FIELDS, picture: "https://image.example/a.webp" };
    expect(JSON.parse(buildChannelCreateTemplate(withPicture, 1_000).content)).toEqual({
      name: FIELDS.name,
      about: FIELDS.about,
      picture: "https://image.example/a.webp",
    });
  });
});

describe("buildChannelEditTemplate", () => {
  const CH = "c".repeat(64);

  it("取り直した版の未知キー（relays）・未知タグを保ち、name / about / picture だけ上書き", () => {
    const base = channelEvent(
      41,
      [
        ["e", CH],
        ["client", "other"],
      ],
      2_000,
      {
        name: "旧名",
        about: "旧説明",
        picture: "https://old.example/a.webp",
        relays: ["wss://room.example/"],
      },
    );
    const draft = buildChannelEditTemplate(base, CH, { name: "新名", about: "新説明", picture: "" }, 1_000);
    expect(draft.kind).toBe(41);
    expect(draft.tags).toEqual([
      ["e", CH],
      ["client", "other"],
    ]);
    expect(JSON.parse(draft.content)).toEqual({
      name: "新名",
      about: "新説明",
      relays: ["wss://room.example/"],
    });
    expect(draft.created_at).toBe(2_001);
  });

  it("base が無ければ e タグだけで新しく作る", () => {
    const draft = buildChannelEditTemplate(null, CH, FIELDS, 1_000);
    expect(draft).toEqual({
      kind: 41,
      content: JSON.stringify({ name: FIELDS.name, about: FIELDS.about }),
      tags: [["e", CH]],
      created_at: 1_000,
    });
  });
});

describe("latestOwnChannelMeta", () => {
  it("自分の kind:41 の最新版（無ければその kind:40）", () => {
    const created = channelEvent(40, [], 1_000, { name: "作成時" });
    addVerified(created);
    expect(latestOwnChannelMeta(me, created.id)).toBe(created);

    const older = channelEvent(41, [["e", created.id]], 2_000, { name: "旧編集" });
    const newer = channelEvent(41, [["e", created.id]], 3_000, { name: "新編集" });
    addVerified(older);
    addVerified(newer);
    expect(latestOwnChannelMeta(me, created.id)).toBe(newer);
  });

  it("どちらも無ければ null", () => {
    expect(latestOwnChannelMeta(me, "f".repeat(64))).toBeNull();
  });
});

describe("publishNewChannel", () => {
  it("write ∪ インデクサへ kind:40 を発行する", async () => {
    await publishNewChannel(FIELDS);
    expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
    const [draft, opts] = vi.mocked(publishEvent).mock.calls[0];
    expect(draft.kind).toBe(40);
    expect(opts?.relays).toEqual([...new Set([...DEFAULTS, ...INDEXER_RELAYS])]);
  });

  it("署名に失敗したら同じ reason の ChannelEditError", async () => {
    vi.mocked(publishEvent).mockRejectedValueOnce(new PublishError("sign-failed"));
    const error = await publishNewChannel(FIELDS).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: "ChannelEditError", reason: "sign-failed" });
  });
});

describe("publishChannelEdit", () => {
  const CH = "c".repeat(64);
  const channelRelays = ["wss://room.example/"];

  it("どのリレーからも応答が無ければ発行せず unreachable（手元に版があっても）", async () => {
    addVerified(channelEvent(40, [], 1_000, { name: "作成時" }));
    vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));

    const error = await publishChannelEdit({
      me,
      channelId: CH,
      channelRelays,
      fields: FIELDS,
      basedOnId: null,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ChannelEditError);
    expect(error).toMatchObject({ reason: "unreachable" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("編集を始めた時点の版と取り直した最新版が違えば発行せず stale", async () => {
    const cached = channelEvent(40, [], 1_000, { name: "作成時" });
    addVerified(cached);
    const latest = channelEvent(41, [["e", cached.id]], 2_000, { name: "他端末での編集" });
    vi.mocked(requestOnce).mockImplementation(
      () =>
        new Observable<NostrEvent>((subscriber) => {
          addVerified(latest, "wss://indexer.example");
          subscriber.next(latest);
          subscriber.complete();
        }),
    );

    const fromCreated = await publishChannelEdit({
      me,
      channelId: cached.id,
      channelRelays,
      fields: FIELDS,
      basedOnId: cached.id,
    }).catch((e: unknown) => e);

    expect(fromCreated).toMatchObject({ name: "ChannelEditError", reason: "stale" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("版が一致すれば取り直した最新版を土台に発行し、未知キー・タグを残す。送り先は write ∪ インデクサ ∪ チャンネルの relays", async () => {
    const created = channelEvent(40, [], 1_000, { name: "作成時" });
    addVerified(created);
    const latest = channelEvent(
      41,
      [
        ["e", created.id],
        ["x", "keep"],
      ],
      2_000,
      { name: "現行", about: "現行の説明", relays: ["wss://room.example/"] },
    );
    vi.mocked(requestOnce).mockImplementation(
      () =>
        new Observable<NostrEvent>((subscriber) => {
          addVerified(latest, "wss://indexer.example");
          subscriber.next(latest);
          subscriber.complete();
        }),
    );

    await publishChannelEdit({
      me,
      channelId: created.id,
      channelRelays,
      fields: { name: "新名", about: "新説明", picture: "" },
      basedOnId: latest.id,
    });

    expect(vi.mocked(requestOnce)).toHaveBeenCalledWith(
      [...new Set([...DEFAULTS, ...INDEXER_RELAYS, ...channelRelays])],
      [
        { kinds: [40], ids: [created.id] },
        { kinds: [41], authors: [me], "#e": [created.id] },
      ],
      OWN_REPLACEABLE_REFETCH_MS,
    );
    expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
    const [draft, opts] = vi.mocked(publishEvent).mock.calls[0];
    expect(draft).toMatchObject({
      kind: 41,
      tags: [
        ["e", created.id],
        ["x", "keep"],
      ],
    });
    expect(JSON.parse(draft.content)).toEqual({
      name: "新名",
      about: "新説明",
      relays: ["wss://room.example/"],
    });
    expect(opts?.relays).toEqual([...new Set([...DEFAULTS, ...INDEXER_RELAYS, ...channelRelays])]);
  });

  it("応答はあったが kind:40 / 41 が無ければ base=null のまま、basedOnId も null なら発行する", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    await publishChannelEdit({ me, channelId: CH, channelRelays: [], fields: FIELDS, basedOnId: null });
    expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(publishEvent).mock.calls[0][0].tags).toEqual([["e", CH]]);
  });

  it("署名に失敗したら同じ reason の ChannelEditError", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    vi.mocked(publishEvent).mockRejectedValueOnce(new PublishError("sign-failed"));

    const error = await publishChannelEdit({
      me,
      channelId: CH,
      channelRelays: [],
      fields: FIELDS,
      basedOnId: null,
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({ name: "ChannelEditError", reason: "sign-failed" });
  });
});
