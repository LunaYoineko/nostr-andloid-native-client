import type { NostrEvent } from "nostr-tools/pure";
import { type CustomColors, normalizeHex } from "./customPalette";

/**
 * テーマストア（#539）。配布されるテーマ1件（NIP-78 kind:30078）の解析・識別子・共有コード。
 * ネイティブ nostr-core `app/nostrdeck/model/Appearance.kt` の ThemeEntry と同じ規則。
 *
 * イベント構造:
 *   kind    : 30078（addressable。同じ d を再発行すれば上書き＝更新）
 *   tags    : [["d","nostrism:theme:<slug>"], ["t","nostrism-theme"], ["title", name]]
 *             ↑ t タグは他ユーザーのテーマを一覧取得するため（d は完全一致しか引けない）
 *   content : {"app":"nostrism","schema":1,"name","minAppVersion","colors":{"bg","text","accent"}}
 */
export const THEME_APP = "nostrism";
/** 一覧取得用の t タグ */
export const THEME_DISCOVERY_TAG = "nostrism-theme";
/** d タグの接頭辞 */
export const THEME_D_PREFIX = "nostrism:theme:";
export const THEME_SCHEMA = 1;
/** content に minAppVersion が無いときの既定（ネイティブ ThemeEntry.minAppVersion の既定と同じ） */
export const DEFAULT_MIN_APP_VERSION = "0.3.0";

/** ストアの1件。取得したイベントから解析した後の形（author・dTag・eventId・createdAt を含む） */
export type ThemeEntry = {
  name: string;
  colors: CustomColors;
  minAppVersion: string;
  schema: number;
  /** 作者 pubkey（hex） */
  author: string;
  /** イベントの d タグ（識別子） */
  dTag: string;
  eventId: string;
  createdAt: number;
};

/** 共有コード（nostrism-theme:1:<name>:<bg>,<text>,<accent>:<minAppVersion>）が指す中身 */
export type ThemeCode = { name: string; colors: CustomColors; minAppVersion: string; schema: number };

/**
 * name → d タグ用の slug（ネイティブ ThemeEntry.slug と同じ規則）。
 * 小文字化し、文字・数字以外の1文字ずつを "-" に置き換える（連続する "-" はまとめない）。
 * 前後の "-" を除き、空になったら "theme"。
 */
export function themeSlug(name: string): string {
  const mapped = [...name.toLowerCase()].map((ch) => (/^[\p{L}\p{Nd}]$/u.test(ch) ? ch : "-")).join("");
  const trimmed = mapped.replace(/^-+|-+$/g, "");
  return trimmed === "" ? "theme" : trimmed;
}

/** name から発行する d タグ（"nostrism:theme:<slug>"） */
export function themeDTag(name: string): string {
  return `${THEME_D_PREFIX}${themeSlug(name)}`;
}

/**
 * kind:30078 の content(JSON) を ThemeEntry へ解析する。想定外の形は null（壊れた配布物・他アプリの
 * 30078 で落ちない）。d タグが無い・app が他アプリ・name / 3色のいずれかが無ければ捨てる。
 * minAppVersion 省略時は DEFAULT_MIN_APP_VERSION、schema 省略時は THEME_SCHEMA。
 */
export function parseThemeEntry(event: NostrEvent): ThemeEntry | null {
  const dTag = event.tags.find((t) => t[0] === "d")?.[1];
  if (!dTag) return null;

  let data: unknown;
  try {
    data = JSON.parse(event.content);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;

  // 他アプリの 30078 を誤って読まないよう app を確認する（無ければ許す）
  if (typeof obj.app === "string" && obj.app !== THEME_APP) return null;

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (name === "") return null;

  const colorsObj =
    typeof obj.colors === "object" && obj.colors !== null ? (obj.colors as Record<string, unknown>) : null;
  const bg = normalizeHex(typeof colorsObj?.bg === "string" ? colorsObj.bg : null);
  const text = normalizeHex(typeof colorsObj?.text === "string" ? colorsObj.text : null);
  const accent = normalizeHex(typeof colorsObj?.accent === "string" ? colorsObj.accent : null);
  if (!bg || !text || !accent) return null;

  const minAppVersion =
    typeof obj.minAppVersion === "string" && obj.minAppVersion.trim() !== ""
      ? obj.minAppVersion
      : DEFAULT_MIN_APP_VERSION;
  const schema = typeof obj.schema === "number" && Number.isFinite(obj.schema) ? obj.schema : THEME_SCHEMA;

  return {
    name,
    colors: { bg, text, accent },
    minAppVersion,
    schema,
    author: event.pubkey,
    dTag,
    eventId: event.id,
    createdAt: event.created_at,
  };
}

/**
 * 共有コード（ネイティブ ThemeEntry.encodeCode と同じ形式）。
 * `nostrism-theme:<schema>:<name>:<bg>,<text>,<accent>:<minAppVersion>`
 * name の ":" は "-" に置換する（区切り文字と衝突しないように）。
 */
export function encodeThemeCode(input: {
  name: string;
  colors: CustomColors;
  minAppVersion?: string;
  schema?: number;
}): string {
  const safeName = input.name.replace(/:/g, "-");
  const schema = input.schema ?? THEME_SCHEMA;
  const minAppVersion = input.minAppVersion ?? DEFAULT_MIN_APP_VERSION;
  const hex = (v: string) => v.replace(/^#/, "");
  return (
    `${THEME_APP}-theme:${schema}:${safeName}:` +
    `${hex(input.colors.bg)},${hex(input.colors.text)},${hex(input.colors.accent)}:${minAppVersion}`
  );
}

/** 共有コードを復元する（ネイティブ ThemeEntry.decodeCode と同じ）。形式が違う・色が不正なら null */
export function decodeThemeCode(code: string): ThemeCode | null {
  const parts = code.trim().split(":");
  if (parts.length < 4) return null;
  if (parts[0].toLowerCase() !== `${THEME_APP}-theme`) return null;
  const schema = Number(parts[1]);
  if (!Number.isFinite(schema)) return null;
  const name = parts[2];
  if (name === "") return null;
  const cols = parts[3].split(",");
  if (cols.length !== 3) return null;
  const bg = normalizeHex(cols[0]);
  const text = normalizeHex(cols[1]);
  const accent = normalizeHex(cols[2]);
  if (!bg || !text || !accent) return null;
  const rawMinVersion = parts[4]?.trim();
  const minAppVersion = rawMinVersion ? rawMinVersion : DEFAULT_MIN_APP_VERSION;
  return { name, colors: { bg, text, accent }, minAppVersion, schema };
}
