import { act, renderHook } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, Observable, type Subject, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { requestOnce } from "../../nostr/pool";
import { PublishError, publishEvent } from "../../nostr/publish";
import { addVerified, eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import type { ThemeEntry } from "./themeEntry";
import {
  buildThemePublishTemplate,
  dedupeThemeEntries,
  filterThemeEntries,
  publishTheme,
  requestDeleteTheme,
  sortThemeEntries,
  THEME_FETCH_MS,
  THEME_LIST_CAP,
  ThemePublishError,
  useThemeStoreEntries,
} from "./themeStore";

// リレーには繋がず、REQ ごとに Subject を返す（EOSE・完了はテストから流す）
vi.mock("../../nostr/pool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../nostr/pool")>();
  const { Subject } = await import("rxjs");
  // 実物の useReadRelays（zustand セレクタ）は変わらない限り同じ配列を返す。テストでも同じ参照を返す
  const relays = ["wss://relay.example"];
  return { ...actual, useReadRelays: () => relays, requestOnce: vi.fn(() => new Subject<NostrEvent>()) };
});

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
  vi.mocked(requestOnce).mockClear();
  vi.mocked(publishEvent).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function themeEvent(
  author: Uint8Array,
  name: string,
  dTag: string,
  createdAt: number,
  tags: string[][] = [],
) {
  return finalizeEvent(
    {
      kind: 30078,
      created_at: createdAt,
      content: JSON.stringify({
        app: "nostrism",
        schema: 1,
        name,
        minAppVersion: "0.3.0",
        colors: { bg: "#000000", text: "#FFFFFF", accent: "#FF0000" },
      }),
      tags: [["d", dTag], ["t", "nostrism-theme"], ...tags],
    },
    author,
  );
}

function entry(overrides: Partial<ThemeEntry> = {}): ThemeEntry {
  return {
    name: "Sakura",
    colors: { bg: "#FDF3F5", text: "#2A1E22", accent: "#C2557A" },
    minAppVersion: "0.3.0",
    schema: 1,
    author: "author1",
    dTag: "nostrism:theme:sakura",
    eventId: "id1",
    createdAt: 1_000,
    ...overrides,
  };
}

describe("dedupeThemeEntries", () => {
  it("同じ (author, dTag) は createdAt が新しい方だけ残す", () => {
    const older = entry({ eventId: "old", createdAt: 1_000, name: "Old" });
    const newer = entry({ eventId: "new", createdAt: 2_000, name: "New" });
    expect(dedupeThemeEntries([older, newer])).toEqual([newer]);
    expect(dedupeThemeEntries([newer, older])).toEqual([newer]);
  });

  it("author か dTag が違えば両方残す", () => {
    const a = entry({ author: "a", dTag: "d1" });
    const b = entry({ author: "b", dTag: "d1" });
    const c = entry({ author: "a", dTag: "d2" });
    expect(dedupeThemeEntries([a, b, c])).toHaveLength(3);
  });
});

describe("filterThemeEntries", () => {
  const mine = entry({ author: "me", name: "Mine" });
  const friend = entry({ author: "friend", name: "Friend's" });
  const stranger = entry({ author: "stranger", name: "Stranger" });
  const all = [mine, friend, stranger];

  it("scope: all はそのまま", () => {
    expect(filterThemeEntries(all, { query: "", scope: "all", me: "me", follows: new Set() })).toEqual(all);
  });

  it("scope: following はフォロー中の author だけ", () => {
    const result = filterThemeEntries(all, {
      query: "",
      scope: "following",
      me: "me",
      follows: new Set(["friend"]),
    });
    expect(result).toEqual([friend]);
  });

  it("scope: mine は自分の author だけ", () => {
    const result = filterThemeEntries(all, { query: "", scope: "mine", me: "me", follows: new Set() });
    expect(result).toEqual([mine]);
  });

  it("検索はテーマ名・作者名（authorName）に一致するものだけ", () => {
    const byName = filterThemeEntries(all, { query: "friend", scope: "all", me: null, follows: new Set() });
    expect(byName).toEqual([friend]);

    const byAuthor = filterThemeEntries(all, {
      query: "author-of-mine",
      scope: "all",
      me: null,
      follows: new Set(),
      authorName: (pubkey) => (pubkey === "me" ? "author-of-mine" : undefined),
    });
    expect(byAuthor).toEqual([mine]);
  });
});

describe("sortThemeEntries", () => {
  const a = entry({ name: "Banana", createdAt: 1_000 });
  const b = entry({ name: "Apple", createdAt: 2_000 });

  it("newest は createdAt 降順", () => {
    expect(sortThemeEntries([a, b], "newest")).toEqual([b, a]);
  });

  it("name は名前順", () => {
    expect(sortThemeEntries([a, b], "name")).toEqual([b, a]);
  });

  it("引数の配列は書き換えない", () => {
    const original = [a, b];
    sortThemeEntries(original, "name");
    expect(original).toEqual([a, b]);
  });
});

describe("useThemeStoreEntries", () => {
  function last() {
    return vi.mocked(requestOnce).mock.results.at(-1)?.value as Subject<NostrEvent>;
  }

  it("開くと自分のリレー + インデクサへ kind:30078(#t=nostrism-theme) を 1 度だけ取りに行く", () => {
    const { result } = renderHook(() => useThemeStoreEntries());
    expect(result.current.loading).toBe(true);
    expect(vi.mocked(requestOnce)).toHaveBeenCalledWith(
      ["wss://relay.example", ...INDEXER_RELAYS],
      [{ kinds: [30078], "#t": ["nostrism-theme"], limit: THEME_LIST_CAP }],
      THEME_FETCH_MS,
    );
  });

  it("完了・失敗のどちらでも読み込み中を消す", () => {
    const { result } = renderHook(() => useThemeStoreEntries());
    act(() => last().complete());
    expect(result.current.loading).toBe(false);
  });

  it("届いた 30078 を解析して返す（EventStore 経由・重複除去込み）", () => {
    const authorKey = generateSecretKey();
    const older = themeEvent(authorKey, "Old", "nostrism:theme:unique-1", 1_000);
    const newer = themeEvent(authorKey, "New", "nostrism:theme:unique-1", 2_000);
    const { result } = renderHook(() => useThemeStoreEntries());
    act(() => {
      eventStore.add(older);
      eventStore.add(newer);
      last().complete();
    });
    const found = result.current.entries.filter((e) => e.dTag === "nostrism:theme:unique-1");
    expect(found).toEqual([expect.objectContaining({ name: "New", eventId: newer.id })]);
  });

  it("閉じると REQ をやめる", () => {
    const { unmount } = renderHook(() => useThemeStoreEntries());
    const sub = last();
    expect(sub.observed).toBe(true);
    unmount();
    expect(sub.observed).toBe(false);
  });
});

describe("buildThemePublishTemplate", () => {
  it("base が無ければ d/t/title だけ", () => {
    const template = buildThemePublishTemplate(
      null,
      "Sakura",
      { bg: "#000", text: "#fff", accent: "#f00" },
      1_000,
    );
    expect(template.kind).toBe(30078);
    expect(template.tags).toEqual([
      ["d", "nostrism:theme:sakura"],
      ["t", "nostrism-theme"],
      ["title", "Sakura"],
    ]);
    expect(template.created_at).toBe(1_000);
    expect(JSON.parse(template.content)).toMatchObject({ app: "nostrism", schema: 1, name: "Sakura" });
  });

  it("base の未知タグは保持し、d/t/title は作り直す。created_at は base より後", () => {
    const base = finalizeEvent(
      {
        kind: 30078,
        created_at: 2_000,
        content: "{}",
        tags: [
          ["d", "nostrism:theme:sakura"],
          ["t", "nostrism-theme"],
          ["title", "Old Name"],
          ["x", "unknown", "value"],
        ],
      },
      generateSecretKey(),
    );
    const template = buildThemePublishTemplate(
      base,
      "Sakura",
      { bg: "#000", text: "#fff", accent: "#f00" },
      1_000,
    );
    expect(template.tags).toEqual([
      ["d", "nostrism:theme:sakura"],
      ["t", "nostrism-theme"],
      ["title", "Sakura"],
      ["x", "unknown", "value"],
    ]);
    expect(template.created_at).toBeGreaterThan(2_000);
  });
});

describe("buildThemePublishTemplate（content の保持。#478）", () => {
  it("base の content にある未知の項目・他の色・minAppVersion は残し、名前と 3 色だけ差し替える", () => {
    const base = finalizeEvent(
      {
        kind: 30078,
        created_at: 2_000,
        content: JSON.stringify({
          app: "nostrism",
          schema: 1,
          name: "Old",
          minAppVersion: "0.9.0",
          description: "from native",
          colors: { bg: "#111111", text: "#222222", accent: "#333333", surface: "#444444" },
        }),
        tags: [["d", "nostrism:theme:sakura"]],
      },
      generateSecretKey(),
    );
    const template = buildThemePublishTemplate(
      base,
      "Sakura",
      { bg: "#000000", text: "#FFFFFF", accent: "#FF0000" },
      3_000,
    );
    expect(JSON.parse(template.content)).toEqual({
      app: "nostrism",
      schema: 1,
      name: "Sakura",
      minAppVersion: "0.9.0",
      description: "from native",
      colors: { bg: "#000000", text: "#FFFFFF", accent: "#FF0000", surface: "#444444" },
    });
  });
});

describe("publishTheme（#478 の規則）", () => {
  const colors = { bg: "#000000", text: "#FFFFFF", accent: "#FF0000" };

  it("どのリレーからも応答が無ければ発行しない", async () => {
    vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));
    const error = await publishTheme(me, "Sakura", colors).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ThemePublishError);
    expect(error).toMatchObject({ reason: "no-theme" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("手元にあった版と取り直した最新版の id が違えば発行しない（stale）", async () => {
    const dTag = "nostrism:theme:sakura";
    // 同じ鍵（= 同じ me）で created_at だけ違う版（別端末で更新した想定。id は変わる）
    const localVersion = themeEvent(key, "Sakura", dTag, 1_000);
    addVerified(localVersion);
    const remoteVersion = themeEvent(key, "Sakura", dTag, 2_000);
    vi.mocked(requestOnce).mockImplementation(
      () =>
        new Observable<NostrEvent>((subscriber) => {
          addVerified(remoteVersion, "wss://relay.example");
          subscriber.next(remoteVersion);
          subscriber.complete();
        }),
    );

    const error = await publishTheme(me, "Sakura", colors).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: "ThemePublishError", reason: "stale" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("同じ d の版が無ければ発行される", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    await publishTheme(me, "Sakura", colors);
    expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
  });

  it("署名の失敗は同じ reason の ThemePublishError", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    vi.mocked(publishEvent).mockRejectedValueOnce(new PublishError("sign-failed"));
    await expect(publishTheme(me, "Sakura", colors)).rejects.toMatchObject({
      name: "ThemePublishError",
      reason: "sign-failed",
    });
  });
});

describe("requestDeleteTheme", () => {
  beforeEach(() => {
    useSession.setState({ status: "in", method: "nip07", pubkey: me });
  });

  it("自分のテーマなら kind:5 に e・k・a を付けて発行する", async () => {
    const dTag = "nostrism:theme:sakura";
    const event = themeEvent(key, "Sakura", dTag, 1_000);
    addVerified(event);

    const ok = await requestDeleteTheme({
      name: "Sakura",
      colors: { bg: "#000000", text: "#FFFFFF", accent: "#FF0000" },
      minAppVersion: "0.3.0",
      schema: 1,
      author: me,
      dTag,
      eventId: event.id,
      createdAt: 1_000,
    });

    expect(ok).toBe(true);
    expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
    const draft = vi.mocked(publishEvent).mock.calls[0][0];
    expect(draft.kind).toBe(5);
    expect(draft.tags).toEqual([
      ["e", event.id],
      ["k", "30078"],
      ["a", `30078:${me}:${dTag}`],
    ]);
  });

  it("EventStore に見つからなければ false（発行しない）", async () => {
    const ok = await requestDeleteTheme(entry({ author: me, dTag: "nostrism:theme:missing" }));
    expect(ok).toBe(false);
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });
});
