import { create } from "zustand";

/** 設定値。auto はブラウザの言語に合わせる */
export type LocaleSetting = "auto" | "ja" | "en";
/** 実際に使う辞書の系統。ja-kansai は ja の関西弁上書き */
export type Locale = "ja" | "en" | "ja-kansai";

/** 値は LocaleSetting の文字列そのまま。NIP-78 の同期には入れない（端末ごとの事情） */
export const LOCALE_KEY = "nostrism.locale";
/** `on` / `off`（既定 off） */
export const KANSAI_KEY = "nostrism.kansaiMode";

function readSetting(): LocaleSetting {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    if (v === "ja" || v === "en") return v;
  } catch {
    // 壊れた保存値は既定（auto）へ
  }
  return "auto";
}

function readKansai(): boolean {
  try {
    return localStorage.getItem(KANSAI_KEY) === "on";
  } catch {
    return false;
  }
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/**
 * 設定とブラウザの言語から辞書の系統を決める（純関数）。
 * auto は先頭の言語が ja* なら ja、それ以外（無しを含む）は en。関西弁は ja のときだけ効く。
 */
export function resolveLocale(setting: LocaleSetting, kansai: boolean, languages: readonly string[]): Locale {
  const base = setting === "auto" ? (/^ja\b/i.test(languages[0] ?? "") ? "ja" : "en") : setting;
  return kansai && base === "ja" ? "ja-kansai" : base;
}

interface LocaleState {
  setting: LocaleSetting;
  kansai: boolean;
  resolved: Locale;
}

function initialState(): LocaleState {
  const setting = readSetting();
  const kansai = readKansai();
  return { setting, kansai, resolved: resolveLocale(setting, kansai, browserLanguages()) };
}

export const useLocale = create<LocaleState>()(() => initialState());

/** 現在の辞書の系統 */
export function getLocale(): Locale {
  return useLocale.getState().resolved;
}

/** ja / ja-kansai → ja、en → en（Intl や <html lang> 用） */
export function baseLocale(locale: Locale = getLocale()): "ja" | "en" {
  return locale === "en" ? "en" : "ja";
}

/** 言語の設定を変える */
export function setLocaleSetting(setting: LocaleSetting): void {
  const { kansai } = useLocale.getState();
  useLocale.setState({ setting, resolved: resolveLocale(setting, kansai, browserLanguages()) });
  try {
    localStorage.setItem(LOCALE_KEY, setting);
  } catch {
    // 保存できなくてもこのセッションでは効く
  }
}

/** 関西弁のオン・オフを変える */
export function setKansaiMode(kansai: boolean): void {
  const { setting } = useLocale.getState();
  useLocale.setState({ kansai, resolved: resolveLocale(setting, kansai, browserLanguages()) });
  try {
    localStorage.setItem(KANSAI_KEY, kansai ? "on" : "off");
  } catch {
    // 保存できなくてもこのセッションでは効く
  }
}

function applyAttributes({ resolved }: LocaleState): void {
  const root = document.documentElement;
  root.lang = baseLocale(resolved);
  if (resolved === "ja-kansai") root.dataset.dialect = "kansai";
  else delete root.dataset.dialect;
}

/**
 * `<html lang>` と `data-dialect` を当て、設定・ブラウザ言語の変更に追従する。
 * React の描画前に同期的に呼ぶ（main.tsx）。
 */
export function initLocale(): void {
  const refresh = () => {
    const { setting, kansai } = useLocale.getState();
    useLocale.setState({ resolved: resolveLocale(setting, kansai, browserLanguages()) });
  };
  applyAttributes(useLocale.getState());
  useLocale.subscribe(applyAttributes);
  window.addEventListener("languagechange", refresh);
}
