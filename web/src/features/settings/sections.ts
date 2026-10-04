import { t } from "../../i18n";

/** 設定の 1 項目。ready = 中身があるもの（プロフィール・DM・ふぁぼ・ミュート・アカウント・リレー・メディアサーバー・ウォレット・表示・データ・キャッシュ。他は準備中） */
export type SettingsSection = { id: string; label: () => string; ready: boolean };

export type SettingsGroup = { title: () => string; sections: readonly SettingsSection[] };

/**
 * 一覧の並び（ネイティブ SettingsScreen の paletteFav / paletteGroups と同じ順）。
 * 「プロフィール」「DM」は設定の中では描かず、自分のプロフィール・DM の画面を開く（ネイティブ profile_view / dm_view）。
 */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    title: () => t("group_quick_access"),
    sections: [
      { id: "profile", label: () => t("tile_profile"), ready: true },
      { id: "dm", label: () => "DM", ready: true },
      { id: "favs", label: () => t("section_favs"), ready: true },
      { id: "bookmarks", label: () => t("section_bookmarks"), ready: true },
      { id: "mute", label: () => t("section_mute"), ready: true },
    ],
  },
  {
    title: () => t("group_customize"),
    sections: [
      { id: "reaction", label: () => t("section_reaction"), ready: true },
      { id: "emoji", label: () => t("section_emoji"), ready: true },
      { id: "hashtags", label: () => t("section_hashtags"), ready: true },
      { id: "display", label: () => t("section_appearance"), ready: true },
    ],
  },
  {
    title: () => t("group_connection"),
    sections: [
      { id: "profile-edit", label: () => t("section_account"), ready: true },
      { id: "account", label: () => t("section_signer"), ready: true },
      { id: "relays", label: () => t("section_relays"), ready: true },
      { id: "dm-relays", label: () => t("section_dm_relays"), ready: true },
      { id: "media", label: () => t("section_media"), ready: true },
      { id: "wallet", label: () => t("section_wallet"), ready: true },
    ],
  },
  {
    title: () => t("group_system"),
    sections: [
      { id: "data", label: () => t("section_data"), ready: true },
      { id: "about", label: () => t("section_about"), ready: true },
    ],
  },
];

/** タイルとして遷移する項目の id（設定の中では描かず、プロフィール・DM の画面を開く） */
const TILE_SECTION_IDS: ReadonlySet<string> = new Set(["profile", "dm"]);

/** 一覧の順で、タイル（profile / dm）以外の最初の項目の id */
function firstSelectableSectionId(): string {
  for (const group of SETTINGS_GROUPS) {
    for (const section of group.sections) {
      if (!TILE_SECTION_IDS.has(section.id)) return section.id;
    }
  }
  throw new Error("no selectable section");
}

/** Expanded で項目を選んでいないときに右へ出す項目 = 一覧の順でタイル以外の最初の項目（#643） */
export const DEFAULT_SECTION_ID = firstSelectableSectionId();

/** 改名した項目の古い id → 今の id。「テーマストア」は「表示」の導線行に統合した（#587） */
const RENAMED_SECTIONS: ReadonlyMap<string, string> = new Map([
  ["developer", "data"],
  ["theme-store", "display"],
]);

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
