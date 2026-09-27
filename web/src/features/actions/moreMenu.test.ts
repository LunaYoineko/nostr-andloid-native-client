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
    report: vi.fn(),
    copyText: vi.fn(),
    copyLink: vi.fn(),
    copyId: vi.fn(),
    copyNote1: vi.fn(),
    copyNevent: vi.fn(),
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
    note1: NOTE1,
    nevent: NEVENT,
    on,
  });
  expect(shape(entries)).toEqual(["[Nostrism から投稿]", "---", "フォロー解除", "通報 (danger)", ...COPIES]);

  // 項目は対応する操作を呼ぶ
  const select = (label: string) => {
    const entry = entries.find((e) => e.type === "item" && e.label === label);
    if (entry?.type === "item") entry.onSelect();
  };
  select("フォロー解除");
  select("通報");
  select("リンクをコピー（njump）");
  select("note1abcdefg… をコピー");
  expect(on.unfollow).toHaveBeenCalledTimes(1);
  expect(on.report).toHaveBeenCalledTimes(1);
  expect(on.copyLink).toHaveBeenCalledTimes(1);
  expect(on.copyNote1).toHaveBeenCalledTimes(1);
  expect(on.follow).not.toHaveBeenCalled();
});

it("未フォローは「フォロー」、自分の kind:3 が未取得（null）ならフォロー項目なし", () => {
  const base = { clientName: null, isMine: false, note1: NOTE1, nevent: NEVENT, on: actions() };
  expect(shape(moreMenuEntries({ ...base, isFollowing: false }))).toEqual([
    "フォロー",
    "通報 (danger)",
    ...COPIES,
  ]);
  expect(shape(moreMenuEntries({ ...base, isFollowing: null }))).toEqual(["通報 (danger)", ...COPIES]);
});

it("自分の投稿はフォロー項目なしで「削除をリクエスト」", () => {
  const entries = moreMenuEntries({
    clientName: "Nostrism",
    isMine: true,
    isFollowing: true,
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
    note1: NOTE1,
    nevent: NEVENT,
    on: actions(),
  });
  expect(shape(entries)[0]).toBe("削除をリクエスト (danger)");
});
