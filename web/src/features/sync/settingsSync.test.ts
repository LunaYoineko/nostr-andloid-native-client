import { afterEach, describe, expect, it } from "vitest";
import { setAuthPolicy, useAuthPolicy } from "../../nostr/relayAuth";
import { setDefaultReaction, useDefaultReaction } from "../actions/reactionPrefs";
import { setBoldText, setNoteAccent, useThemePrefs } from "../theme/themePrefs";
import {
  applySyncSettingDiffs,
  decodeSettingsPayload,
  diffSyncSettings,
  encodeSettingsPayload,
  readCurrentSyncSettings,
  SETTINGS_SYNC_WHITELIST,
} from "./settingsSync";

// ネイティブのキー定数（EventRepository.kt）と同じリテラル
const AUTH_POLICY = "nip42_auth_policy";
const BOLD_TEXT_KEY = "appearance_bold_text";
const REACTION_CONTENT = "default_reaction:content";
const REACTION_IMAGE = "default_reaction:image";
const NOTE_ACCENT_STYLE_KEY = "ui:note_accent";

afterEach(() => {
  localStorage.clear();
});

describe("diffSyncSettings（ネイティブ SettingsSyncDiffTest.kt の移植）", () => {
  it("同じ値なら差分は無い", () => {
    const local = { [AUTH_POLICY]: "dm", [BOLD_TEXT_KEY]: "0" };
    expect(diffSyncSettings(local, local)).toEqual([]);
  });

  it("違う値はホワイトリスト順（AUTH → 太字 → リアクション → 種別表示）で並ぶ", () => {
    const local = { [AUTH_POLICY]: "dm", [BOLD_TEXT_KEY]: "0", [NOTE_ACCENT_STYLE_KEY]: "none" };
    const remote = { [NOTE_ACCENT_STYLE_KEY]: "line", [AUTH_POLICY]: "always", [BOLD_TEXT_KEY]: "0" };
    expect(diffSyncSettings(local, remote)).toEqual([
      { key: AUTH_POLICY, localValue: "dm", remoteValue: "always" },
      { key: NOTE_ACCENT_STYLE_KEY, localValue: "none", remoteValue: "line" },
    ]);
  });

  it("リモートに無いキー（古いスナップショット）とホワイトリスト外のキーは無視する", () => {
    const local = { [AUTH_POLICY]: "dm", [BOLD_TEXT_KEY]: "1" };
    // リモートは古いスナップショット（AUTH_POLICY 無し）+ ホワイトリスト外のキー
    const remote = { [BOLD_TEXT_KEY]: "0", "unknown:key": "x" };
    expect(diffSyncSettings(local, remote)).toEqual([
      { key: BOLD_TEXT_KEY, localValue: "1", remoteValue: "0" },
    ]);
  });

  it("[#468 データ保護6] 値の形が不正なキーは、反映する前に弾いて差分にも出さない", () => {
    const local = {
      [AUTH_POLICY]: "dm",
      [BOLD_TEXT_KEY]: "0",
      [NOTE_ACCENT_STYLE_KEY]: "none",
    };
    const remote = {
      [AUTH_POLICY]: "bogus", // dm/always/off のどれでもない
      [BOLD_TEXT_KEY]: "yes", // 1/0 ではない
      [NOTE_ACCENT_STYLE_KEY]: "line", // これは正しい
    };
    expect(diffSyncSettings(local, remote)).toEqual([
      { key: NOTE_ACCENT_STYLE_KEY, localValue: "none", remoteValue: "line" },
    ]);
  });
});

describe("readCurrentSyncSettings / applySyncSettingDiffs", () => {
  it("5キーぶんの現在値を読み、チェックした差分だけを各ストアへ適用する", () => {
    setAuthPolicy("always");
    setBoldText(true);
    setDefaultReaction("🎉", "https://example.com/e.png");
    setNoteAccent("line");

    const current = readCurrentSyncSettings();
    expect(current).toEqual({
      [AUTH_POLICY]: "always",
      [BOLD_TEXT_KEY]: "1",
      [REACTION_CONTENT]: "🎉",
      [REACTION_IMAGE]: "https://example.com/e.png",
      [NOTE_ACCENT_STYLE_KEY]: "line",
    });

    applySyncSettingDiffs([
      { key: AUTH_POLICY, localValue: "always", remoteValue: "off" },
      { key: REACTION_CONTENT, localValue: "🎉", remoteValue: "+" },
      // 不正な値は適用しない
      { key: BOLD_TEXT_KEY, localValue: "1", remoteValue: "maybe" },
    ]);

    expect(useAuthPolicy.getState().policy).toBe("off");
    expect(useDefaultReaction.getState()).toEqual({ content: "+", image: "https://example.com/e.png" });
    expect(useThemePrefs.getState().bold).toBe(true); // 不正な値は無視されて変わらない
  });

  it("画像だけの差分を適用しても content は変わらない（もう一方は現在値のまま）", () => {
    setDefaultReaction("👍", null);
    applySyncSettingDiffs([{ key: REACTION_IMAGE, localValue: "", remoteValue: "https://x/y.png" }]);
    expect(useDefaultReaction.getState()).toEqual({ content: "👍", image: "https://x/y.png" });
  });
});

describe("encodeSettingsPayload / decodeSettingsPayload", () => {
  it("{version:1, settings} の平文 JSON を書き、そのまま読める", () => {
    const settings = { [AUTH_POLICY]: "dm", [BOLD_TEXT_KEY]: "0" };
    const content = encodeSettingsPayload(settings);
    expect(content).toBe(JSON.stringify({ version: 1, settings }));
    expect(decodeSettingsPayload(content)).toEqual({ version: 1, settings });
  });

  it("壊れた JSON・settings が無い形は null。文字列でない値のキーだけを個別に捨てる", () => {
    expect(decodeSettingsPayload("{broken")).toBeNull();
    expect(decodeSettingsPayload("[]")).toBeNull();
    expect(decodeSettingsPayload(JSON.stringify({ version: 1 }))).toBeNull();
    expect(
      decodeSettingsPayload(JSON.stringify({ version: 1, settings: { a: "x", b: 1, c: null } })),
    ).toEqual({
      version: 1,
      settings: { a: "x" },
    });
  });
});

describe("SETTINGS_SYNC_WHITELIST", () => {
  it("ネイティブ SETTINGS_SYNC_WHITELIST と同じ5キー・同じ順", () => {
    expect(SETTINGS_SYNC_WHITELIST.map((s) => s.key)).toEqual([
      AUTH_POLICY,
      BOLD_TEXT_KEY,
      REACTION_CONTENT,
      REACTION_IMAGE,
      NOTE_ACCENT_STYLE_KEY,
    ]);
  });
});
