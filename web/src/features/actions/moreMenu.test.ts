import { expect, it, vi } from "vitest";
import type { MenuEntry } from "../../ui/MenuButton";
import { type MoreMenuActions, moreMenuEntries } from "./moreMenu";

const NOTE1 = "note1abcdefghijklmnopqrstuvwxyz";
const NEVENT = "nevent1abcdefghijklmnopqrstuvwxyz";

function actions(): MoreMenuActions {
  return {
    follow: vi.fn(),
    unfollow: vi.fn(),
    requestDelete: vi.fn(),
    mute: vi.fn(),
    unmute: vi.fn(),
    report: vi.fn(),
    copyText: vi.fn(),
    copyLink: vi.fn(),
    copyId: vi.fn(),
    copyNote1: vi.fn(),
    copyNevent: vi.fn(),
    viewJson: vi.fn(),
  };
}

/** 比べやすい形（header / separator / 項目のラベル。danger は印を付ける） */
function shape(entries: MenuEntry[]): string[] {
  return entries.map((e) =>
    e.type === "separator"
      ? "---"
      : e.type === "header"
        ? `[${e.label}]`
        : `${e.label}${e.tone === "danger" ? " (danger)" : ""}`,
  );
}

const COPIES = [
  "---",
  "テキストをコピー",
  "リンクをコピー（njump）",
  "投稿IDをコピー",
  "note1abcdefg… をコピー",
  "nevent1abcde… をコピー",
];

it("他人・client あり・フォロー中の並び", () => {
  const on = actions();
  const entries = moreMenuEntries({
    clientName: "Nostrism",
    isMine: false,
    isFollowing: true,
    isMuted: false,
    note1: NOTE1,
    nevent: NEVENT,
    on,
  });
  expect(shape(entries)).toEqual([
    "[Nostrism から投稿]",
    "---",
    "フォロー解除",
    "このユーザーをミュート",
    "通報 (danger)",
    ...COPIES,
  ]);

  // 項目は対応する操作を呼ぶ
  const select = (label: string) => {
    const entry = entries.find((e) => e.type === "item" && e.label === label);
    if (entry?.type === "item") entry.onSelect();
  };
  select("フォロー解除");
  select("このユーザーをミュート");
  select("通報");
  select("リンクをコピー（njump）");
  select("note1abcdefg… をコピー");
  expect(on.unfollow).toHaveBeenCalledTimes(1);
  expect(on.mute).toHaveBeenCalledTimes(1);
  expect(on.report).toHaveBeenCalledTimes(1);
  expect(on.copyLink).toHaveBeenCalledTimes(1);
  expect(on.copyNote1).toHaveBeenCalledTimes(1);
  expect(on.follow).not.toHaveBeenCalled();
});

it("未フォローは「フォロー」、自分の kind:3 が未取得（null）ならフォロー項目なし", () => {
  const base = {
    clientName: null,
    isMine: false,
    isMuted: false,
    note1: NOTE1,
    nevent: NEVENT,
    on: actions(),
  };
  expect(shape(moreMenuEntries({ ...base, isFollowing: false }))).toEqual([
    "フォロー",
    "このユーザーをミュート",
    "通報 (danger)",
    ...COPIES,
  ]);
  expect(shape(moreMenuEntries({ ...base, isFollowing: null }))).toEqual([
    "このユーザーをミュート",
    "通報 (danger)",
    ...COPIES,
  ]);
});

it("ミュート中の人は「ミュートを解除」", () => {
  const on = actions();
  const entries = moreMenuEntries({
    clientName: null,
    isMine: false,
    isFollowing: null,
    isMuted: true,
    note1: NOTE1,
    nevent: NEVENT,
    on,
  });
  expect(shape(entries)).toEqual(["ミュートを解除", "通報 (danger)", ...COPIES]);
  const entry = entries[0];
  if (entry.type === "item") entry.onSelect();
  expect(on.unmute).toHaveBeenCalledTimes(1);
  expect(on.mute).not.toHaveBeenCalled();
});

it("自分の投稿はフォロー項目なしで「削除をリクエスト」", () => {
  const entries = moreMenuEntries({
    clientName: "Nostrism",
    isMine: true,
    isFollowing: true,
    isMuted: false,
    note1: NOTE1,
    nevent: NEVENT,
    on: actions(),
  });
  expect(shape(entries)).toEqual(["[Nostrism から投稿]", "---", "削除をリクエスト (danger)", ...COPIES]);
});

it("client タグが無ければ見出しと最初の区切りを出さない", () => {
  const entries = moreMenuEntries({
    clientName: null,
    isMine: true,
    isFollowing: null,
    isMuted: false,
    note1: NOTE1,
    nevent: NEVENT,
    on: actions(),
  });
  expect(shape(entries)[0]).toBe("削除をリクエスト (danger)");
});

it("開発者モードの間は末尾に「イベントJSONを表示」", () => {
  const on = actions();
  const base = {
    clientName: null,
    isMine: true,
    isFollowing: null,
    isMuted: false,
    note1: NOTE1,
    nevent: NEVENT,
    on,
  };
  expect(shape(moreMenuEntries({ ...base, developerMode: false })).at(-1)).toBe("nevent1abcde… をコピー");
  const entries = moreMenuEntries({ ...base, developerMode: true });
  expect(shape(entries)).toEqual(["削除をリクエスト (danger)", ...COPIES, "イベントJSONを表示"]);
  const last = entries.at(-1);
  if (last?.type === "item") last.onSelect();
  expect(on.viewJson).toHaveBeenCalledTimes(1);
});
