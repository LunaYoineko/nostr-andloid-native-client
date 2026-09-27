import { afterEach, expect, it, vi } from "vitest";
import { buildColumn, type ColumnSpec, DEFAULT_COLUMNS, decodeDeckColumns } from "../lib/columns";

/** 保存が空の状態からストアを作り直す（一時カラムの戻りスタックもモジュールごと初期化する） */
async function freshDeck() {
  vi.resetModules();
  localStorage.clear();
  return import("./deck");
}

function hashtagColumn(tag: string, sec: number): ColumnSpec {
  const spec = buildColumn("HASHTAG", { text: tag }, new Set(), sec);
  if (!spec) throw new Error("buildColumn returned null");
  return spec;
}

/** 保存されている固定カラムの id（並び順） */
function savedIds(key: string): string[] | undefined {
  return decodeDeckColumns(localStorage.getItem(key) ?? "")?.map((s) => s.id);
}

afterEach(() => {
  localStorage.clear();
});

it("初期状態は既定カラム", async () => {
  const { useDeck } = await freshDeck();
  expect(useDeck.getState().columns).toEqual(DEFAULT_COLUMNS);
});

it("addColumn: 末尾に足してジャンプし、保存する", async () => {
  const { useDeck, COLUMNS_KEY } = await freshDeck();
  const spec = hashtagColumn("bitcoin", 100);
  useDeck.getState().addColumn(spec);

  const { columns, jumpTarget } = useDeck.getState();
  expect(columns.at(-1)).toEqual({ ...spec, order: 3 });
  expect(jumpTarget).toBe(spec.id);
  expect(savedIds(COLUMNS_KEY)).toEqual(["c_following", "c_hashtag", "c_notif", spec.id]);
});

it("openTransient: 一時カラムとして足し保存しない。同じ id は重複させない", async () => {
  const { useDeck, COLUMNS_KEY } = await freshDeck();
  const spec = hashtagColumn("bitcoin", 100);
  expect(useDeck.getState().openTransient(spec)).toBe(spec.id);
  expect(useDeck.getState().openTransient(spec)).toBe(spec.id);

  const { columns } = useDeck.getState();
  expect(columns).toHaveLength(4);
  expect(columns[3]).toMatchObject({ id: spec.id, pinned: false });
  expect(savedIds(COLUMNS_KEY)).toEqual(["c_following", "c_hashtag", "c_notif"]);
});

it("pin で保存に入り、unpin で保存から消える", async () => {
  const { useDeck, COLUMNS_KEY } = await freshDeck();
  const spec = hashtagColumn("bitcoin", 100);
  useDeck.getState().openTransient(spec);

  useDeck.getState().pin(spec.id);
  expect(useDeck.getState().columns[3].pinned).toBe(true);
  expect(savedIds(COLUMNS_KEY)).toEqual(["c_following", "c_hashtag", "c_notif", spec.id]);

  useDeck.getState().unpin("c_hashtag");
  expect(useDeck.getState().columns[1].pinned).toBe(false);
  expect(savedIds(COLUMNS_KEY)).toEqual(["c_following", "c_notif", spec.id]);
});

it("moveColumn: 端を越える移動は無視し、中では入れ替えて order を 0..n-1 に振り直す", async () => {
  const { useDeck, COLUMNS_KEY } = await freshDeck();
  const ids = () => useDeck.getState().columns.map((c) => c.id);

  useDeck.getState().moveColumn("c_following", -1);
  useDeck.getState().moveColumn("c_notif", 1);
  expect(ids()).toEqual(["c_following", "c_hashtag", "c_notif"]);

  useDeck.getState().moveColumn("c_hashtag", -1);
  expect(ids()).toEqual(["c_hashtag", "c_following", "c_notif"]);
  expect(useDeck.getState().columns.map((c) => c.order)).toEqual([0, 1, 2]);
  expect(savedIds(COLUMNS_KEY)).toEqual(["c_hashtag", "c_following", "c_notif"]);
});

it("updateColumn: id / pinned / order を保ったまま中身を差し替える", async () => {
  const { useDeck, COLUMNS_KEY } = await freshDeck();
  const edited = hashtagColumn("lightning", 100);
  useDeck.getState().updateColumn("c_hashtag", edited);

  const column = useDeck.getState().columns[1];
  expect(column).toEqual({ ...edited, id: "c_hashtag", pinned: true, order: 1 });
  expect(decodeDeckColumns(localStorage.getItem(COLUMNS_KEY) ?? "")?.[1].title).toBe("#lightning");
});

it("back: 開いた順と逆に一時カラムを閉じて元のカラムへ戻る。閉じるものが無ければ false", async () => {
  const { useDeck } = await freshDeck();
  const first = hashtagColumn("a", 100);
  const second = hashtagColumn("b", 101);
  useDeck.getState().openTransient(first, "c_notif");
  useDeck.getState().openTransient(second, first.id);

  expect(useDeck.getState().back()).toBe(true);
  expect(useDeck.getState().columns.map((c) => c.id)).toEqual([
    "c_following",
    "c_hashtag",
    "c_notif",
    first.id,
  ]);
  expect(useDeck.getState().jumpTarget).toBe(first.id);

  expect(useDeck.getState().back()).toBe(true);
  expect(useDeck.getState().columns.map((c) => c.id)).toEqual(["c_following", "c_hashtag", "c_notif"]);
  expect(useDeck.getState().jumpTarget).toBe("c_notif");

  expect(useDeck.getState().back()).toBe(false);
});

it("openHashtag: 同じタグのカラムがあればそこへジャンプし、無ければ一時カラムを開く", async () => {
  const { useDeck } = await freshDeck();
  expect(useDeck.getState().openHashtag("#Nostr")).toBe("c_hashtag");
  expect(useDeck.getState().columns).toHaveLength(3);
  expect(useDeck.getState().jumpTarget).toBe("c_hashtag");

  const id = useDeck.getState().openHashtag("#bitcoin");
  const column = useDeck.getState().columns.at(-1);
  expect(column).toMatchObject({ id, kind: "HASHTAG", title: "#bitcoin", pinned: false });
  expect(column?.filter.hashtags).toEqual(["bitcoin"]);
  expect(useDeck.getState().openHashtag("#")).toBeNull();
});

it("setWidth: S / L は保存し、M はキーを消す", async () => {
  const { useDeck, WIDTHS_KEY, widthOf } = await freshDeck();
  useDeck.getState().setWidth("c_hashtag", "S");
  expect(localStorage.getItem(WIDTHS_KEY)).toBe('{"c_hashtag":"S"}');
  expect(widthOf(useDeck.getState(), "c_hashtag")).toBe("S");

  useDeck.getState().setWidth("c_hashtag", "M");
  expect(localStorage.getItem(WIDTHS_KEY)).toBe("{}");
  expect(widthOf(useDeck.getState(), "c_hashtag")).toBe("M");
});

it("removeColumn: カラムを消すと幅の設定も消す", async () => {
  const { useDeck, WIDTHS_KEY, COLUMNS_KEY } = await freshDeck();
  useDeck.getState().setWidth("c_hashtag", "L");
  useDeck.getState().setWidth("c_notif", "S");

  useDeck.getState().removeColumn("c_hashtag");
  expect(useDeck.getState().widths).toEqual({ c_notif: "S" });
  expect(localStorage.getItem(WIDTHS_KEY)).toBe('{"c_notif":"S"}');
  expect(savedIds(COLUMNS_KEY)).toEqual(["c_following", "c_notif"]);
});

it("setRevealMuted: カラムごとに保存し、カラムを消すと設定も消す。壊れた保存値は空", async () => {
  const { useDeck, REVEAL_MUTED_KEY, isMutedRevealed, loadRevealMuted } = await freshDeck();
  expect(isMutedRevealed(useDeck.getState(), "c_hashtag")).toBe(false);

  useDeck.getState().setRevealMuted("c_hashtag", true);
  useDeck.getState().setRevealMuted("c_notif", true);
  useDeck.getState().setRevealMuted("c_notif", true);
  expect(localStorage.getItem(REVEAL_MUTED_KEY)).toBe('["c_hashtag","c_notif"]');
  expect(isMutedRevealed(useDeck.getState(), "c_hashtag")).toBe(true);

  useDeck.getState().setRevealMuted("c_hashtag", false);
  expect(localStorage.getItem(REVEAL_MUTED_KEY)).toBe('["c_notif"]');

  useDeck.getState().removeColumn("c_notif");
  expect(useDeck.getState().revealMuted).toEqual([]);
  expect(localStorage.getItem(REVEAL_MUTED_KEY)).toBe("[]");

  localStorage.setItem(REVEAL_MUTED_KEY, "{broken");
  expect(loadRevealMuted()).toEqual([]);
  localStorage.setItem(REVEAL_MUTED_KEY, '["c_a", 1, "c_a"]');
  expect(loadRevealMuted()).toEqual(["c_a"]);
});

it("applyPinnedColumns: 固定カラムを置き換え、開いている一時カラムは残す", async () => {
  const { useDeck, COLUMNS_KEY } = await freshDeck();
  const transient = hashtagColumn("bitcoin", 100);
  useDeck.getState().openTransient(transient);
  const synced = [
    { ...hashtagColumn("wrc", 200), order: 1 },
    { ...DEFAULT_COLUMNS[2], order: 0 },
  ];

  useDeck.getState().applyPinnedColumns(synced);
  expect(useDeck.getState().columns.map((c) => c.id)).toEqual(["c_notif", synced[0].id, transient.id]);
  expect(savedIds(COLUMNS_KEY)).toEqual(["c_notif", synced[0].id]);
});
