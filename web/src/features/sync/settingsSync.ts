import { t } from "../../i18n";
import type { AuthPolicy } from "../../nostr/relayAuth";
import { setAuthPolicy, useAuthPolicy } from "../../nostr/relayAuth";
import { setDefaultReaction, useDefaultReaction } from "../actions/reactionPrefs";
import type { NoteAccentStyle } from "../theme/noteAccent";
import { setBoldText, setNoteAccent, useThemePrefs } from "../theme/themePrefs";

/**
 * [#468] 設定のリレー同期（NIP-78 / kind:30078, d=SETTINGS_SYNC_D）。
 * ネイティブ SettingsSync.kt の写し（キー名・値の形・ホワイトリストの順・差分計算はそのまま）。
 *
 * 「明示的な操作でしか書き換わらない」インポート/エクスポート型:
 *  - 保存は手動のみ（設定画面のボタン）。自動発行・自動取込・常時購読はしない（relaySyncIO.ts）。
 *  - ロードも手動。取得スナップショットとローカル現在値の差分だけを一覧表示し、
 *    チェックした項目だけを個別適用する。
 *
 * content は平文 JSON {"version":1,"settings":{"<キー>":"<値>"}}。
 */

/** 30078（d=SETTINGS_SYNC_D）の content。 */
export type SettingsSyncPayload = { version: number; settings: Record<string, string> };

/** 設定1件の差分（ローカル現在値 → リモート値）。 */
export type SettingDiff = { key: string; localValue: string; remoteValue: string };

/**
 * 同期対象1件分の定義。キー・値の検証・現在値の読み出し・適用・表示ラベルをここに集約する。
 * 同期対象を増やすときは SETTINGS_SYNC_WHITELIST に1エントリ追加するだけでよい。
 */
export type SyncSettingSpec = {
  /** ローカルの保存キー = スナップショット JSON のキー（ネイティブと同じ）。 */
  key: string;
  /** 差分一覧に出す設定名。 */
  label: string;
  /** リモート値の形が正しいか（[#468] データ保護6: 不正な値は取り込み前に弾く。壊れた値は差分にも出さない）。 */
  isValid: (value: string) => boolean;
  /** 現在値の正規化文字列（未設定でも既定値を返す）。 */
  read: () => string;
  /** リモート値の適用（各ストアの setter 経由で反映する）。isValid を満たす値だけを渡すこと。 */
  apply: (value: string) => void;
  /** 値 → 差分一覧に出す表示ラベル。 */
  display: (value: string) => string;
};

function isOnOff(v: string): boolean {
  return v === "1" || v === "0";
}

function isAuthPolicy(v: string): v is AuthPolicy {
  return v === "dm" || v === "always" || v === "off";
}

function isNoteAccentStyle(v: string): v is NoteAccentStyle {
  return v === "none" || v === "line" || v === "bg";
}

/**
 * [#468] リレー同期対象のホワイトリスト（ネイティブ SETTINGS_SYNC_WHITELIST と同じ5キー・同じ順）。
 * 端末ごとに変えたい設定・端末ローカル値・他の kind で同期済みのものは対象外（ネイティブと同じ方針）。
 */
export const SETTINGS_SYNC_WHITELIST: readonly SyncSettingSpec[] = [
  {
    key: "nip42_auth_policy",
    get label() {
      return t("auth_title");
    },
    isValid: isAuthPolicy,
    read: () => useAuthPolicy.getState().policy,
    apply: (v) => {
      if (isAuthPolicy(v)) setAuthPolicy(v);
    },
    display: (v) => (v === "off" ? t("auth_off") : v === "always" ? t("auth_always") : t("auth_dm_mine")),
  },
  {
    key: "appearance_bold_text",
    get label() {
      return t("bold_text_title");
    },
    isValid: isOnOff,
    read: () => (useThemePrefs.getState().bold ? "1" : "0"),
    apply: (v) => {
      if (isOnOff(v)) setBoldText(v === "1");
    },
    display: (v) => (v === "1" ? t("sync_value_on") : t("sync_value_off")),
  },
  {
    key: "default_reaction:content",
    get label() {
      return t("reaction_default_title");
    },
    // 自由入力（Unicode 絵文字 or :code:）。形の制約は無い
    isValid: () => true,
    read: () => useDefaultReaction.getState().content,
    apply: (v) => setDefaultReaction(v, useDefaultReaction.getState().image),
    // "+" は表示上は ❤️（ingest 側の正規化と同じ。ネイティブと同じ表示）
    display: (v) => (v === "+" || v === "" ? "❤️" : v),
  },
  {
    key: "default_reaction:image",
    get label() {
      return t("sync_name_reaction_image");
    },
    // URL か空文字（画像なし）。形の制約は無い
    isValid: () => true,
    read: () => useDefaultReaction.getState().image ?? "",
    apply: (v) => setDefaultReaction(useDefaultReaction.getState().content, v === "" ? null : v),
    display: (v) => (v.trim() === "" ? t("sync_value_none") : v),
  },
  {
    key: "ui:note_accent",
    get label() {
      return t("note_accent_title");
    },
    isValid: isNoteAccentStyle,
    read: () => useThemePrefs.getState().noteAccent,
    apply: (v) => {
      if (isNoteAccentStyle(v)) setNoteAccent(v);
    },
    display: (v) =>
      v === "line" ? t("note_accent_line") : v === "bg" ? t("note_accent_bg") : t("note_accent_none"),
  },
];

/** ホワイトリスト設定の現在値スナップショット（正規化済み文字列）。差分計算・発行に使う。 */
export function readCurrentSyncSettings(): Record<string, string> {
  const settings: Record<string, string> = {};
  for (const spec of SETTINGS_SYNC_WHITELIST) settings[spec.key] = spec.read();
  return settings;
}

/**
 * 設定の差分を計算する（純関数。ネイティブ diffSyncSettings の写し）。ホワイトリスト順で、
 * リモートに存在して値が違うキーだけを返す。リモートに無いキー（古いスナップショット等）、
 * ホワイトリスト外のキー（Web にまだ無い設定）、値の形が不正なキー（[#468] データ保護6）は無視する。
 */
export function diffSyncSettings(
  local: Readonly<Record<string, string>>,
  remote: Readonly<Record<string, string>>,
): SettingDiff[] {
  const diffs: SettingDiff[] = [];
  for (const spec of SETTINGS_SYNC_WHITELIST) {
    const r = remote[spec.key];
    const l = local[spec.key];
    if (r === undefined || l === undefined) continue;
    if (!spec.isValid(r)) continue;
    if (l === r) continue;
    diffs.push({ key: spec.key, localValue: l, remoteValue: r });
  }
  return diffs;
}

/** チェックされた設定差分だけを、各ストアの setter 経由で適用する（isValid を満たす値だけ）。 */
export function applySyncSettingDiffs(diffs: readonly SettingDiff[]): void {
  for (const diff of diffs) {
    const spec = SETTINGS_SYNC_WHITELIST.find((s) => s.key === diff.key);
    if (spec?.isValid(diff.remoteValue)) spec.apply(diff.remoteValue);
  }
}

/** 発行する content（{"version":1,"settings":{...}}）。 */
export function encodeSettingsPayload(settings: Record<string, string>): string {
  return JSON.stringify({ version: 1, settings } satisfies SettingsSyncPayload);
}

/**
 * 保存用の content を作る（[#468] データ保護3）。リモートの content（無ければ null）を、Web が知らない部分
 * （知らないキー・文字列でない値・settings 以外のトップレベルの項目）ごと残し、settings の local のキーだけを
 * 上書きする。リモートが読めない・新しい version（1 以外）なら null（上書きすると消すので発行しない）。
 */
export function mergeSettingsContent(
  remoteContent: string | null,
  local: Record<string, string>,
): string | null {
  if (remoteContent === null) return encodeSettingsPayload(local);
  let value: unknown;
  try {
    value = JSON.parse(remoteContent);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (Object.hasOwn(obj, "version") && obj.version !== 1) return null;
  const settings = obj.settings;
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) return null;
  return JSON.stringify({ ...obj, settings: { ...settings, ...local } });
}

/**
 * content を読む（壊れていれば null）。settings の値が文字列でないキーだけを個別に捨てる
 * （[#468] データ保護6: 形が想定外でも、他のキーまで壊さない）。
 */
export function decodeSettingsPayload(content: string): SettingsSyncPayload | null {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const rawSettings = obj.settings;
  if (typeof rawSettings !== "object" || rawSettings === null || Array.isArray(rawSettings)) return null;
  const settings: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawSettings as Record<string, unknown>)) {
    if (typeof v === "string") settings[k] = v;
  }
  const version = typeof obj.version === "number" ? obj.version : 1;
  return { version, settings };
}
