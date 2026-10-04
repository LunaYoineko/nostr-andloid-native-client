import { useCallback } from "react";
import jaKansai from "./ja-kansai.json";
import { getLocale, type Locale, useLocale } from "./locale";
import nativeEn from "./native.en.json";
import nativeJa from "./native.ja.json";
import webEn from "./web.en.json";
import webJa from "./web.ja.json";

type Dict = Readonly<Record<string, string>>;

const JA: Dict = { ...nativeJa, ...webJa };
const EN: Dict = { ...nativeEn, ...webEn };
const KANSAI: Dict = jaKansai;

/** 辞書の引き順。どの言語でも最後は ja（訳が無いキーを日本語で出す） */
const CHAINS: Record<Locale, readonly Dict[]> = {
  "ja-kansai": [KANSAI, JA],
  ja: [JA],
  en: [EN, JA],
};

/** `%1$s` / `%2$d`（位置指定）・`%s` / `%d`（順番）・`%%`。引数が足りない指定はそのまま残す */
export function formatArgs(template: string, args: readonly (string | number)[]): string {
  let next = 0;
  return template.replace(/%(?:(\d+)\$)?([sd%])/g, (match, pos: string | undefined, kind: string) => {
    if (kind === "%") return pos === undefined ? "%" : match;
    const index = pos === undefined ? next++ : Number(pos) - 1;
    return index < args.length ? String(args[index]) : match;
  });
}

function translate(locale: Locale, key: string, args: readonly (string | number)[]): string {
  for (const dict of CHAINS[locale]) {
    const value = dict[key];
    if (value !== undefined) return formatArgs(value, args);
  }
  // 未知キーはテストでは落とし、本番では目に見える形（キー文字列）で出して warn
  if (import.meta.env.MODE === "test") throw new Error(`i18n: 未知のキー "${key}"`);
  console.warn(`i18n: 未知のキー "${key}"`);
  return key;
}

/** 文言を引く（ネイティブ strings.xml と同じキー名・書式）。React の外や再描画不要な所用 */
export function t(key: string, ...args: (string | number)[]): string {
  return translate(getLocale(), key, args);
}

/** コンポーネント用。言語の変更で再描画される */
export function useT(): typeof t {
  const locale = useLocale((s) => s.resolved);
  return useCallback((key: string, ...args: (string | number)[]) => translate(locale, key, args), [locale]);
}
