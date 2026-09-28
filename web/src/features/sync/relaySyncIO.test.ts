import type { Filter } from "applesauce-core/helpers/filter";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { EMPTY, Observable, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COLUMNS, defaultFilter, encodeDeckColumns } from "../../lib/columns";
import { requestOnce } from "../../nostr/pool";
import { type EventDraft, publishEvent } from "../../nostr/publish";
import { addVerified } from "../../nostr/store";
import { pinnedColumns, useDeck } from "../../store/deck";
import {
  BASED_ON_KEY,
  basedOnIdFor,
  clearBasedOnForTest,
  DECK_COLUMNS_D,
  isDefaultColumnsUnchanged,
  loadRelaySync,
  publishRelaySync,
  RelaySyncError,
  SETTINGS_SYNC_D,
} from "./relaySyncIO";
import { encodeSettingsPayload } from "./settingsSync";

/**
 * [#468] relaySyncIO のテスト。リレーには繋がない（requestOnce / publishEvent はテストごとに差し替える）。
 * データ保護（issue コメント）の各項目を describe の見出しに対応させてある。
 */

vi.mock("../../nostr/pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/pool")>()),
  requestOnce: vi.fn(),
}));

vi.mock("../../nostr/publish", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/publish")>()),
  publishEvent: vi.fn(),
}));

let key: Uint8Array;
let me: string;

beforeEach(() => {
  key = generateSecretKey();
  me = getPublicKey(key);
  vi.mocked(requestOnce).mockReset();
  vi.mocked(publishEvent).mockReset();
  localStorage.clear();
  // 既定カラムのまま（未変更）を初期状態にする。変更したいテストは個別に setState する
  useDeck.setState({ columns: DEFAULT_COLUMNS.map((c) => ({ ...c })) });
});

afterEach(() => {
  localStorage.clear();
});

function sync30078(d: string, content: string, createdAt: number): NostrEvent {
  return finalizeEvent({ kind: 30078, created_at: createdAt, tags: [["d", d]], content }, key);
}

/** d タグごとに応答するイベントを決める requestOnce の偽実装（refetchOwnReplaceable が1 filter ずつ呼ぶ）。 */
function refetchResponds(byD: Partial<Record<string, NostrEvent>>) {
  vi.mocked(requestOnce).mockImplementation((_relays, filters) => {
    const d = (filters as Filter[])[0]?.["#d"]?.[0];
    const event = d ? byD[d] : undefined;
    return new Observable<NostrEvent>((subscriber) => {
      if (event) {
        addVerified(event);
        subscriber.next(event);
      }
      subscriber.complete();
    });
  });
}

function setBasedOn(settings: string | null, columns: string | null, pubkey = me): void {
  localStorage.setItem(
    BASED_ON_KEY,
    JSON.stringify({ [pubkey]: { [SETTINGS_SYNC_D]: settings, [DECK_COLUMNS_D]: columns } }),
  );
}

function publishedDrafts(): EventDraft[] {
  return vi.mocked(publishEvent).mock.calls.map((c) => c[0]);
}

/** publishEvent が返す「署名済み」の代わり。id だけテストで指定する（署名の中身は publishRelaySync は見ない） */
function stubSigned(id: string, draft: EventDraft): NostrEvent {
  return {
    id,
    pubkey: me,
    kind: draft.kind,
    created_at: 9_999,
    tags: draft.tags,
    content: draft.content,
    sig: "",
  } as NostrEvent;
}

describe("[#468 データ保護4] 自動では発行しない", () => {
  it("モジュールを読み込むだけでは publishEvent を呼ばない（保存は明示的な操作からしか呼ばれない）", () => {
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });
});

describe("[#468 データ保護1・2] 発行前の安全確認（#478 の規則）", () => {
  it("取り直しでどのリレーからも応答が無ければ発行しない（unreachable）", async () => {
    vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));

    const error = await publishRelaySync(me).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RelaySyncError);
    expect(error).toMatchObject({ reason: "unreachable" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("取り直した版が basedOn（前回読み込み・保存した版）と違えば発行しない（stale）", async () => {
    const settingsEvent = sync30078(SETTINGS_SYNC_D, encodeSettingsPayload({}), 1_000);
    refetchResponds({ [SETTINGS_SYNC_D]: settingsEvent });
    // basedOn は別の id（別端末で更新された想定）
    setBasedOn("stale-id", null);

    const error = await publishRelaySync(me).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RelaySyncError);
    expect(error).toMatchObject({ reason: "stale" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("basedOn は別のアカウントの版とは照合しない（同じ端末で別アカウントが読み込んだ版でも stale）", async () => {
    const settingsEvent = sync30078(SETTINGS_SYNC_D, encodeSettingsPayload({}), 1_000);
    refetchResponds({ [SETTINGS_SYNC_D]: settingsEvent });
    setBasedOn(settingsEvent.id, null, "f".repeat(64));

    await expect(publishRelaySync(me)).rejects.toMatchObject({ reason: "stale" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("一度も読み込み・保存していない（basedOn が null）のにリレーに版があれば stale", async () => {
    const columnsEvent = sync30078(DECK_COLUMNS_D, "[]", 1_000);
    refetchResponds({ [DECK_COLUMNS_D]: columnsEvent });
    clearBasedOnForTest();

    await expect(publishRelaySync(me)).rejects.toMatchObject({ reason: "stale" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("版が一致すれば設定とカラムの2件を発行し、basedOn を新しい id へ更新する", async () => {
    const settingsEvent = sync30078(SETTINGS_SYNC_D, encodeSettingsPayload({}), 1_000);
    const columnsEvent = sync30078(DECK_COLUMNS_D, "[]", 1_000);
    refetchResponds({ [SETTINGS_SYNC_D]: settingsEvent, [DECK_COLUMNS_D]: columnsEvent });
    setBasedOn(settingsEvent.id, columnsEvent.id);
    // 既定のままだと「それだけを理由に」カラムを発行しないので、1件足して変更ありにする
    useDeck.setState({
      columns: [
        ...DEFAULT_COLUMNS,
        { ...DEFAULT_COLUMNS[0], id: "c_extra", order: 3, filter: defaultFilter() },
      ],
    });
    vi.mocked(publishEvent)
      .mockImplementationOnce(async (draft) => stubSigned("new-settings-id", draft))
      .mockImplementationOnce(async (draft) => stubSigned("new-columns-id", draft));

    const result = await publishRelaySync(me);

    expect(result).toEqual({ columnsPublished: true });
    const drafts = publishedDrafts();
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ kind: 30078, tags: [["d", SETTINGS_SYNC_D]] });
    expect(drafts[1]).toMatchObject({ kind: 30078, tags: [["d", DECK_COLUMNS_D]] });
    expect(basedOnIdFor(me, SETTINGS_SYNC_D)).toBe("new-settings-id");
    expect(basedOnIdFor(me, DECK_COLUMNS_D)).toBe("new-columns-id");
  });
});

describe("[#468 データ保護3] Web が知らない設定キーを保つ", () => {
  it("リモートにある未知の設定キーは保存後の content にも残る", async () => {
    const remoteSettings = { future_setting: "from-native", nip42_auth_policy: "always" };
    const settingsEvent = sync30078(SETTINGS_SYNC_D, encodeSettingsPayload(remoteSettings), 1_000);
    refetchResponds({ [SETTINGS_SYNC_D]: settingsEvent });
    setBasedOn(settingsEvent.id, null);
    vi.mocked(publishEvent).mockImplementation(async (draft) =>
      stubSigned(`${draft.tags[0]?.[1]}-signed`, draft),
    );

    await publishRelaySync(me);

    const settingsDraft = publishedDrafts().find((d) => d.tags[0]?.[1] === SETTINGS_SYNC_D);
    const payload: { settings: Record<string, string> } = JSON.parse(settingsDraft?.content ?? "{}");
    // 未知のキーは残り、ホワイトリストの5キーは Web の現在値（既定 dm）で上書きされる
    expect(payload.settings.future_setting).toBe("from-native");
    expect(payload.settings.nip42_auth_policy).toBe("dm");
  });
});

describe("[#468 データ保護3] Web が読めない形は上書きで消さない", () => {
  function changeColumns() {
    useDeck.setState({
      columns: [
        ...DEFAULT_COLUMNS,
        { ...DEFAULT_COLUMNS[0], id: "c_extra", order: 3, filter: defaultFilter() },
      ],
    });
  }

  it("設定の文字列でない値・settings 以外の項目・d 以外のタグは、保存後も残る", async () => {
    const content = JSON.stringify({
      version: 1,
      settings: { nested: { a: 1 }, count: 3, nip42_auth_policy: "always" },
      extra: "from-native",
    });
    const settingsEvent = finalizeEvent(
      {
        kind: 30078,
        created_at: 1_000,
        tags: [
          ["d", SETTINGS_SYNC_D],
          ["client", "nostrism"],
        ],
        content,
      },
      key,
    );
    refetchResponds({ [SETTINGS_SYNC_D]: settingsEvent });
    setBasedOn(settingsEvent.id, null);
    vi.mocked(publishEvent).mockImplementation(async (draft) => stubSigned("signed", draft));

    await publishRelaySync(me);

    const draft = publishedDrafts()[0];
    expect(draft.tags).toEqual([
      ["d", SETTINGS_SYNC_D],
      ["client", "nostrism"],
    ]);
    const payload = JSON.parse(draft.content);
    expect(payload.extra).toBe("from-native");
    expect(payload.settings.nested).toEqual({ a: 1 });
    expect(payload.settings.count).toBe(3);
    expect(payload.settings.nip42_auth_policy).toBe("dm");
  });

  it.each([
    ["新しい version", JSON.stringify({ version: 2, settings: {} })],
    ["壊れた JSON", "{not json"],
    ["settings が無い", JSON.stringify({ version: 1 })],
  ])("設定が%sなら 1 件も発行しない（unknown-format）", async (_label, content) => {
    const settingsEvent = sync30078(SETTINGS_SYNC_D, content, 1_000);
    refetchResponds({ [SETTINGS_SYNC_D]: settingsEvent });
    setBasedOn(settingsEvent.id, null);
    changeColumns();

    await expect(publishRelaySync(me)).rejects.toMatchObject({ reason: "unknown-format" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });

  it("カラム構成に Web が知らない種類の行があれば、設定も含めて 1 件も発行しない（unknown-format）", async () => {
    const rows = JSON.parse(encodeDeckColumns(DEFAULT_COLUMNS));
    rows.push({ ...rows[0], id: "c_future", kind: "FUTURE_KIND" });
    const columnsEvent = sync30078(DECK_COLUMNS_D, JSON.stringify(rows), 1_000);
    refetchResponds({ [DECK_COLUMNS_D]: columnsEvent });
    setBasedOn(null, columnsEvent.id);
    changeColumns();

    await expect(publishRelaySync(me)).rejects.toMatchObject({ reason: "unknown-format" });
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });
});

describe("[#468 データ保護5] 既定のカラムが未変更なら発行しない", () => {
  it("固定カラムが DEFAULT_COLUMNS のままなら、それだけを理由にカラムの30078を発行しない", async () => {
    expect(isDefaultColumnsUnchanged(pinnedColumns(useDeck.getState()))).toBe(true);
    refetchResponds({});
    clearBasedOnForTest();
    vi.mocked(publishEvent).mockImplementation(async (draft) =>
      stubSigned(`${draft.tags[0]?.[1]}-signed`, draft),
    );

    const result = await publishRelaySync(me);

    expect(result).toEqual({ columnsPublished: false });
    const drafts = publishedDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].tags).toEqual([["d", SETTINGS_SYNC_D]]);
  });

  it("既定から1つでも変えていれば isDefaultColumnsUnchanged は false", () => {
    const changed = DEFAULT_COLUMNS.map((c) => (c.id === "c_following" ? { ...c, title: "変更済み" } : c));
    expect(isDefaultColumnsUnchanged(changed)).toBe(false);
    expect(encodeDeckColumns(changed)).not.toBe(encodeDeckColumns(DEFAULT_COLUMNS));
  });
});

describe("loadRelaySync（リレーから読み込む）", () => {
  it("両方そろえば設定とカラムを読み、basedOn を控える", async () => {
    const settingsEvent = sync30078(
      SETTINGS_SYNC_D,
      encodeSettingsPayload({ nip42_auth_policy: "always" }),
      1_000,
    );
    const columnsEvent = sync30078(DECK_COLUMNS_D, encodeDeckColumns(DEFAULT_COLUMNS), 1_000);
    vi.mocked(requestOnce).mockImplementation(() => {
      addVerified(settingsEvent);
      addVerified(columnsEvent);
      return new Observable<NostrEvent>((subscriber) => subscriber.complete());
    });

    const snapshot = await loadRelaySync(me);

    expect(snapshot.settings).toEqual({ nip42_auth_policy: "always" });
    expect(snapshot.columns).toEqual(DEFAULT_COLUMNS);
    expect(basedOnIdFor(me, SETTINGS_SYNC_D)).toBe(settingsEvent.id);
    expect(basedOnIdFor(me, DECK_COLUMNS_D)).toBe(columnsEvent.id);
  });

  it("どのリレーからも応答が無ければ unreachable で、basedOn は書き換えない", async () => {
    vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));
    setBasedOn("kept-settings", "kept-columns");

    await expect(loadRelaySync(me, 10)).rejects.toMatchObject({ reason: "unreachable" });
    expect(basedOnIdFor(me, SETTINGS_SYNC_D)).toBe("kept-settings");
    expect(basedOnIdFor(me, DECK_COLUMNS_D)).toBe("kept-columns");
  });

  it("リレーに何も無ければ両方 null（sync_no_data 相当）で、basedOn も null になる", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    setBasedOn("stale-leftover", "stale-leftover");

    const snapshot = await loadRelaySync(me, 10);

    expect(snapshot).toEqual({ settings: null, columns: null });
    expect(basedOnIdFor(me, SETTINGS_SYNC_D)).toBeNull();
    expect(basedOnIdFor(me, DECK_COLUMNS_D)).toBeNull();
  });
});
