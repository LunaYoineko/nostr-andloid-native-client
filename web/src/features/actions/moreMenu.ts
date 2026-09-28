import type { MenuEntry } from "../../ui/MenuButton";

export type MoreMenuActions = {
  follow(): void;
  unfollow(): void;
  bookmark(): void;
  unbookmark(): void;
  pin(): void;
  unpin(): void;
  requestDelete(): void;
  mute(): void;
  unmute(): void;
  report(): void;
  copyText(): void;
  copyLink(): void;
  copyId(): void;
  copyNote1(): void;
  copyNevent(): void;
  viewJson(): void;
  translate(): void;
  hideTranslation(): void;
};

/**
 * 投稿の ⋯ メニュー（ネイティブ NoteItem.kt の並び）。
 * isFollowing が null（自分の kind:3 が未取得）ならフォロー項目を出さない。
 * isBookmarked が null（自分の kind:10003 が未取得）ならブックマーク項目を出さない（#531）。
 * 自分の投稿は isPinned が null（自分の kind:10001 が未取得）でなければ「プロフィールに固定」。
 * 他人の投稿は「通報」の前に「このユーザーをミュート」（ミュート中なら「ミュートを解除」）。
 * translationVisible が undefined / null（Translator 非対応・本文が空）なら「翻訳」は出さない。
 * false なら「翻訳」、true なら「翻訳を隠す」（コピー系の区切りの前。#541）。
 * 開発者モード（developerMode）の間は末尾に「イベントJSONを表示」。
 */
export function moreMenuEntries(a: {
  clientName: string | null;
  isMine: boolean;
  isFollowing: boolean | null;
  isBookmarked: boolean | null;
  isPinned: boolean | null;
  isMuted: boolean;
  note1: string;
  nevent: string;
  developerMode?: boolean;
  translationVisible?: boolean | null;
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
  if (a.isBookmarked !== null) {
    entries.push(
      a.isBookmarked
        ? { type: "item", label: "ブックマークを解除", onSelect: a.on.unbookmark }
        : { type: "item", label: "ブックマーク", onSelect: a.on.bookmark },
    );
  }
  if (a.isMine) {
    if (a.isPinned !== null) {
      entries.push(
        a.isPinned
          ? { type: "item", label: "プロフィールの固定を解除", onSelect: a.on.unpin }
          : { type: "item", label: "プロフィールに固定", onSelect: a.on.pin },
      );
    }
  } else {
    entries.push(
      a.isMuted
        ? { type: "item", label: "ミュートを解除", onSelect: a.on.unmute }
        : { type: "item", label: "このユーザーをミュート", onSelect: a.on.mute },
    );
  }
  entries.push(
    a.isMine
      ? { type: "item", label: "削除をリクエスト", onSelect: a.on.requestDelete, tone: "danger" }
      : { type: "item", label: "通報", onSelect: a.on.report, tone: "danger" },
  );
  if (a.translationVisible !== undefined && a.translationVisible !== null) {
    entries.push(
      a.translationVisible
        ? { type: "item", label: "翻訳を隠す", onSelect: a.on.hideTranslation }
        : { type: "item", label: "翻訳", onSelect: a.on.translate },
    );
  }
  entries.push(
    { type: "separator" },
    { type: "item", label: "テキストをコピー", onSelect: a.on.copyText },
    { type: "item", label: "リンクをコピー（njump）", onSelect: a.on.copyLink },
    { type: "item", label: "投稿IDをコピー", onSelect: a.on.copyId },
    { type: "item", label: `${a.note1.slice(0, 12)}… をコピー`, onSelect: a.on.copyNote1 },
    { type: "item", label: `${a.nevent.slice(0, 12)}… をコピー`, onSelect: a.on.copyNevent },
  );
  if (a.developerMode) entries.push({ type: "item", label: "イベントJSONを表示", onSelect: a.on.viewJson });
  return entries;
}
