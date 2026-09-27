/** 設定の 1 項目。ready = 中身があるもの（ミュート・アカウント・リレー・メディアサーバー・表示・開発者。他は準備中） */
export type SettingsSection = { id: string; label: string; ready: boolean };

export type SettingsGroup = { title: string; sections: readonly SettingsSection[] };

/**
 * 一覧の並び（ネイティブ SettingsScreen の paletteFav / paletteGroups と同じ順）。
 * ネイティブの「リアクション」は「表示」の既定リアクションに、「データ・キャッシュ」は「開発者」にまとめた。
 */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    title: "よく使う",
    sections: [
      { id: "profile", label: "プロフィール", ready: false },
      { id: "dm", label: "DM", ready: false },
      { id: "favs", label: "ふぁぼ", ready: false },
      { id: "bookmarks", label: "ブックマーク", ready: false },
      { id: "mute", label: "ミュート", ready: true },
    ],
  },
  {
    title: "カスタマイズ",
    sections: [
      { id: "emoji", label: "カスタム絵文字", ready: false },
      { id: "hashtags", label: "ハッシュタグ", ready: false },
      { id: "display", label: "表示", ready: true },
    ],
  },
  {
    title: "接続・アカウント",
    sections: [
      { id: "profile-edit", label: "プロフィール編集", ready: false },
      { id: "account", label: "アカウント", ready: true },
      { id: "relays", label: "リレー", ready: true },
      { id: "dm-relays", label: "DMリレー", ready: false },
      { id: "media", label: "メディアサーバー", ready: true },
      { id: "wallet", label: "ウォレット", ready: false },
    ],
  },
  {
    title: "システム",
    sections: [
      { id: "developer", label: "開発者", ready: true },
      { id: "about", label: "このアプリについて", ready: false },
    ],
  },
];

/** Expanded で項目を選んでいないときに右へ出す項目 */
export const DEFAULT_SECTION_ID = "account";

/** id の項目。無ければ undefined */
export function findSection(id: string | undefined): SettingsSection | undefined {
  if (!id) return undefined;
  for (const group of SETTINGS_GROUPS) {
    const section = group.sections.find((s) => s.id === id);
    if (section) return section;
  }
  return undefined;
}
