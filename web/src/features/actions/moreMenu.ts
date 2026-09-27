import type { MenuEntry } from "../../ui/MenuButton";

export type MoreMenuActions = {
  follow(): void;
  unfollow(): void;
  requestDelete(): void;
  report(): void;
  copyText(): void;
  copyLink(): void;
  copyId(): void;
  copyNote1(): void;
  copyNevent(): void;
};

/**
 * 投稿の ⋯ メニュー（ネイティブ NoteItem.kt の並び。M1 に無い項目 = ブックマーク・プロフィールに固定・ミュート・
 * 翻訳・イベント JSON は出さない）。isFollowing が null（自分の kind:3 が未取得）ならフォロー項目を出さない。
 */
export function moreMenuEntries(a: {
  clientName: string | null;
  isMine: boolean;
  isFollowing: boolean | null;
  note1: string;
  nevent: string;
  on: MoreMenuActions;
}): MenuEntry[] {
  const entries: MenuEntry[] = [];
  if (a.clientName) {
    entries.push({ type: "header", label: `${a.clientName} から投稿` }, { type: "separator" });
  }
  if (!a.isMine && a.isFollowing !== null) {
    entries.push(
      a.isFollowing
        ? { type: "item", label: "フォロー解除", onSelect: a.on.unfollow }
        : { type: "item", label: "フォロー", onSelect: a.on.follow },
    );
  }
  // #465 は「通報」の前に「このユーザーをミュート」を足す
  entries.push(
    a.isMine
      ? { type: "item", label: "削除をリクエスト", onSelect: a.on.requestDelete, tone: "danger" }
      : { type: "item", label: "通報", onSelect: a.on.report, tone: "danger" },
  );
  entries.push(
    { type: "separator" },
    { type: "item", label: "テキストをコピー", onSelect: a.on.copyText },
    { type: "item", label: "リンクをコピー（njump）", onSelect: a.on.copyLink },
    { type: "item", label: "投稿IDをコピー", onSelect: a.on.copyId },
    { type: "item", label: `${a.note1.slice(0, 12)}… をコピー`, onSelect: a.on.copyNote1 },
    { type: "item", label: `${a.nevent.slice(0, 12)}… をコピー`, onSelect: a.on.copyNevent },
  );
  return entries;
}
