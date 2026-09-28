import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, Observable, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestOnce, resetRelays } from "../../nostr/pool";
import { PublishError, publishEvent } from "../../nostr/publish";
import { addVerified } from "../../nostr/store";
import {
  buildProfileContent,
  changedFields,
  ProfileEditError,
  profileFieldsOf,
  publishProfile,
} from "./profileEdit";

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

function profile(
  content: Record<string, unknown> | string,
  createdAt: number,
  tags: string[][] = [],
): NostrEvent {
  return finalizeEvent(
    {
      kind: 0,
      created_at: createdAt,
      tags,
      content: typeof content === "string" ? content : JSON.stringify(content),
    },
    key,
  );
}

/** 取り直しで latest が届いて完了する */
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

function published(): {
  kind: number;
  content: Record<string, unknown>;
  tags: string[][];
  created_at?: number;
} {
  expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
  const [draft] = vi.mocked(publishEvent).mock.calls[0];
  return { ...draft, content: JSON.parse(draft.content) as Record<string, unknown> };
}

describe("編集欄の値", () => {
  it("表示名は display_name → displayName → name の最初の空でない値。他は同名のキー、文字列でなければ空欄", () => {
    expect(
      profileFieldsOf(
        profile(
          {
            display_name: " ",
            displayName: "Alice D",
            name: "alice",
            about: "hello",
            picture: "https://img.example/a.png",
            banner: 123,
            lud16: "alice@ln.example",
            nip05: "alice@example.com",
            website: "example.com",
          },
          1_000,
        ),
      ),
    ).toEqual({
      name: "Alice D",
      about: "hello",
      picture: "https://img.example/a.png",
      banner: "",
      lud16: "alice@ln.example",
      nip05: "alice@example.com",
      website: "example.com",
    });
    expect(profileFieldsOf(profile({ name: "bob" }, 1_000)).name).toBe("bob");
    expect(profileFieldsOf(null)).toEqual({
      name: "",
      about: "",
      picture: "",
      banner: "",
      lud16: "",
      nip05: "",
      website: "",
    });
    // JSON でない content は空欄
    expect(profileFieldsOf(profile("not json", 1_000)).about).toBe("");
  });

  it("変えた項目だけを前後の空白を落として返す（空白だけの違いは変更にしない）", () => {
    const initial = profileFieldsOf(profile({ name: "a", about: "x" }, 1_000));
    expect(
      changedFields(initial, { ...initial, name: " a ", about: "", website: " https://w.example " }),
    ).toEqual({ about: "", website: "https://w.example" });
    expect(changedFields(initial, initial)).toEqual({});
  });
});

describe("content", () => {
  it("未知のキー（bot・pronouns）は残し、変えた項目だけ上書きし、空欄にしたキーは消す", () => {
    const base = profile(
      { name: "alice", about: "old", website: "https://old.example", bot: false, pronouns: "she/her" },
      1_000,
    );
    expect(JSON.parse(buildProfileContent(base, { about: "new", website: "" }))).toEqual({
      name: "alice",
      about: "new",
      bot: false,
      pronouns: "she/her",
    });
  });

  it("display_name / displayName を持つ土台では name と同じ値にし、表示名を空欄にしたら両方消す", () => {
    const base = profile({ name: "alice", display_name: "Alice", displayName: "Alice", about: "a" }, 1_000);
    expect(JSON.parse(buildProfileContent(base, { name: "Alicia" }))).toEqual({
      name: "Alicia",
      display_name: "Alicia",
      displayName: "Alicia",
      about: "a",
    });
    expect(JSON.parse(buildProfileContent(base, { name: "" }))).toEqual({ about: "a" });
    // 持っていなければ足さない
    expect(JSON.parse(buildProfileContent(profile({ name: "bob" }, 1_000), { name: "Bob" }))).toEqual({
      name: "Bob",
    });
  });

  it("土台が無い・JSON で読めなければ変えた項目だけ（空欄は入れない）", () => {
    expect(JSON.parse(buildProfileContent(null, { name: "Bob", about: "hi", website: "" }))).toEqual({
      name: "Bob",
      about: "hi",
    });
    expect(JSON.parse(buildProfileContent(profile("[1]", 1_000), { about: "hi" }))).toEqual({ about: "hi" });
  });
});

describe("publishProfile（#478 の規則）", () => {
  it("取り直しでどのリレーからも応答が無ければ発行せず unreachable（手元に版があっても）", async () => {
    const cached = profile({ name: "alice", about: "old" }, 1_000);
    addVerified(cached);
    vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));

    const error = await publishProfile(me, { about: "new" }, cached.id).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProfileEditError);
    expect(error).toMatchObject({ reason: "unreachable" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("取り直した最新版の id が編集開始時の id と違えば発行せず stale", async () => {
    const cached = profile({ name: "alice", about: "old" }, 1_000);
    addVerified(cached);
    respondWith(profile({ name: "alice", about: "from another device" }, 2_000));

    const fromCached = await publishProfile(me, { about: "new" }, cached.id).catch((e: unknown) => e);
    // 自分の kind:0 を読み込む前（null）に編集していた場合も止める
    const fromNothing = await publishProfile(me, { about: "new" }, null).catch((e: unknown) => e);

    expect(fromCached).toMatchObject({ name: "ProfileEditError", reason: "stale" });
    expect(fromNothing).toMatchObject({ name: "ProfileEditError", reason: "stale" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("同じなら取り直した最新版の未知タグ・未知フィールドを保って発行する（created_at は前の版より後）", async () => {
    const latest = profile(
      {
        name: "alice",
        display_name: "Alice",
        about: "old",
        bot: true,
        pronouns: "they/them",
        lud16: "a@ln.example",
      },
      2_000,
      [
        ["emoji", "wave", "https://emoji.example/wave.png"],
        ["x", "unknown", "value"],
      ],
    );
    addVerified(latest);
    respondWith(latest);

    await publishProfile(me, { about: "new", lud16: "" }, latest.id);

    const draft = published();
    expect(draft.kind).toBe(0);
    expect(draft.content).toEqual({
      name: "alice",
      display_name: "Alice",
      about: "new",
      bot: true,
      pronouns: "they/them",
    });
    expect(draft.tags).toEqual([
      ["emoji", "wave", "https://emoji.example/wave.png"],
      ["x", "unknown", "value"],
    ]);
    expect(draft.created_at).toBeGreaterThan(2_000);
  });

  it("応答はあったが kind:0 が無く、編集開始時も無ければ入力した項目だけで発行する", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);

    await publishProfile(me, { name: "Bob", about: "hi", website: "" }, null);

    const draft = published();
    expect(draft.content).toEqual({ name: "Bob", about: "hi" });
    expect(draft.tags).toEqual([]);
  });

  it("署名に失敗したら同じ reason の ProfileEditError", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    vi.mocked(publishEvent).mockRejectedValueOnce(new PublishError("sign-failed"));

    const error = await publishProfile(me, { name: "Bob" }, null).catch((e: unknown) => e);

    expect(error).toMatchObject({ name: "ProfileEditError", reason: "sign-failed" });
  });
});
