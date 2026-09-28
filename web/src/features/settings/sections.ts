/** 設定の 1 項目。ready = 中身があるもの（プロフィール・DM・ふぁぼ・ミュート・アカウント・リレー・メディアサーバー・ウォレット・表示・データ・キャッシュ。他は準備中） */
export type SettingsSection = { id: string; label: string; ready: boolean };

export type SettingsGroup = { title: string; sections: readonly SettingsSection[] };

/**
 * 一覧の並び（ネイティブ SettingsScreen の paletteFav / paletteGroups と同じ順）。
 * ネイティブの「リアクション」は「表示」の既定リアクションにまとめた。
 * 「プロフィール」「DM」は設定の中では描かず、自分のプロフィール・DM の画面を開く（ネイティブ profile_view / dm_view）。
 */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    title: "よく使う",
    sections: [
      { id: "profile", label: "プロフィール", ready: true },
      { id: "dm", label: "DM", ready: true },
      { id: "favs", label: "ふぁぼ", ready: true },
      { id: "bookmarks", label: "ブックマーク", ready: true },
      { id: "mute", label: "ミュート", ready: true },
    ],
  },
  {
    title: "カスタマイズ",
    sections: [
      { id: "emoji", label: "カスタム絵文字", ready: true },
      { id: "hashtags", label: "ハッシュタグ", ready: true },
      { id: "display", label: "表示", ready: true },
      { id: "theme-store", label: "テーマストア", ready: true },
    ],
  },
  {
    title: "接続・アカウント",
    sections: [
      { id: "profile-edit", label: "プロフィール編集", ready: true },
      { id: "account", label: "アカウント", ready: true },
      { id: "relays", label: "リレー", ready: true },
      { id: "dm-relays", label: "DMリレー", ready: true },
      { id: "media", label: "メディアサーバー", ready: true },
      { id: "wallet", label: "ウォレット", ready: true },
    ],
  },
  {
    title: "システム",
    sections: [
      { id: "data", label: "データ・キャッシュ", ready: true },
      { id: "about", label: "このアプリについて", ready: false },
    ],
  },
];

/** Expanded で項目を選んでいないときに右へ出す項目 */
export const DEFAULT_SECTION_ID = "account";

/** 改名した項目の古い id → 今の id */
const RENAMED_SECTIONS: ReadonlyMap<string, string> = new Map([["developer", "data"]]);

/** 改名した項目の古い id なら今の id（古い URL は今の項目へ置き換える）。それ以外は undefined */
export function renamedSectionId(id: string | undefined): string | undefined {
  return id ? RENAMED_SECTIONS.get(id) : undefined;
}

/** id の項目。無ければ undefined */
export function findSection(id: string | undefined): SettingsSection | undefined {
  if (!id) return undefined;
  for (const group of SETTINGS_GROUPS) {
    const section = group.sections.find((s) => s.id === id);
    if (section) return section;
  }
  return undefined;
}
