import { create } from "zustand";

/** 値は {"mode": ThemeMode, "textScale": TextScale, "bold": boolean} */
export const THEME_KEY = "nostrism.theme";

/** テーマ（ネイティブ ThemeMode の id。CUSTOM は #464 の残り） */
export type ThemeMode = "system" | "light" | "dark";
/** 文字サイズ（ネイティブ TextScale の id。小 / 中 / 大） */
export type TextScale = "s" | "m" | "l";
/** 実際に当てるテーマ */
export type ResolvedTheme = "light" | "dark";

export type ThemePrefs = { mode: ThemeMode; textScale: TextScale; bold: boolean };

/** ダーク・小・太字オフ（ネイティブ ThemeMode.fromId / TextScale.fromId / boldText の既定） */
export const DEFAULT_THEME_PREFS: ThemePrefs = { mode: "dark", textScale: "s", bold: false };

/** 文字サイズの倍率（ネイティブ TextScale.factor と 1 対 1）。tokens.css の --text-scale に入れる */
export const TEXT_SCALE_FACTOR: Record<TextScale, number> = { s: 1, m: 1.15, l: 1.35 };

/** 背景色（theme-color 用。Color.kt DarkPalette.bg / LightPalette.bg、tokens.css の --bg と 1 対 1） */
export const THEME_BACKGROUND: Record<ResolvedTheme, string> = { dark: "#0C0C10", light: "#F2F2F5" };

/** OS のダークモード */
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

function isThemeMode(v: unknown): v is ThemeMode {
  return v === "system" || v === "light" || v === "dark";
}

function isTextScale(v: unknown): v is TextScale {
  return v === "s" || v === "m" || v === "l";
}

/** 無い・壊れている項目は既定へ（項目ごと） */
function readThemePrefs(): ThemePrefs {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(THEME_KEY) ?? "null");
    if (typeof value === "object" && value !== null) {
      const { mode, textScale, bold } = value as Record<string, unknown>;
      return {
        mode: isThemeMode(mode) ? mode : DEFAULT_THEME_PREFS.mode,
        textScale: isTextScale(textScale) ? textScale : DEFAULT_THEME_PREFS.textScale,
        bold: typeof bold === "boolean" ? bold : DEFAULT_THEME_PREFS.bold,
      };
    }
  } catch {
    // 壊れた保存値は既定へ
  }
  return DEFAULT_THEME_PREFS;
}

/** テーマ・文字サイズ・太字（設定 > 表示） */
export const useThemePrefs = create<ThemePrefs>()(() => readThemePrefs());

function update(patch: Partial<ThemePrefs>): void {
  useThemePrefs.setState(patch);
  const { mode, textScale, bold } = useThemePrefs.getState();
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify({ mode, textScale, bold }));
  } catch {
    // 保存できなくてもこのセッションでは効く
  }
}

export function setThemeMode(mode: ThemeMode): void {
  update({ mode });
}

export function setTextScale(textScale: TextScale): void {
  update({ textScale });
}

export function setBoldText(bold: boolean): void {
  update({ bold });
}

function hasMatchMedia(): boolean {
  return typeof window.matchMedia === "function";
}

/** system は OS の設定に従う。matchMedia が無い環境（jsdom 等）はネイティブの既定と同じダーク */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== "system") return mode;
  if (!hasMatchMedia()) return "dark";
  return window.matchMedia(DARK_SCHEME_QUERY).matches ? "dark" : "light";
}

/** PWA のステータスバーの色 */
function setThemeColor(color: string): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = color;
}

/** <html> へ当てる: data-theme・--text-scale・data-bold と theme-color の meta */
export function applyThemePrefs(prefs: ThemePrefs): void {
  const root = document.documentElement;
  const theme = resolveTheme(prefs.mode);
  root.dataset.theme = theme;
  root.style.setProperty("--text-scale", String(TEXT_SCALE_FACTOR[prefs.textScale]));
  root.toggleAttribute("data-bold", prefs.bold);
  setThemeColor(THEME_BACKGROUND[theme]);
}

/**
 * 保存済みの設定を <html> へ同期的に当て、以後の変更（設定・OS のダークモード）に追従する。
 * main.tsx の先頭で React の描画前に 1 度だけ呼ぶ（初回描画のちらつきを避ける。CSP で inline script は置けない）。
 * 戻り値は購読の解除（テスト用）。
 */
export function initTheme(): () => void {
  applyThemePrefs(useThemePrefs.getState());
  const unsubscribe = useThemePrefs.subscribe((prefs) => applyThemePrefs(prefs));
  if (!hasMatchMedia()) return unsubscribe;
  const mql = window.matchMedia(DARK_SCHEME_QUERY);
  const onSchemeChange = () => {
    const prefs = useThemePrefs.getState();
    if (prefs.mode === "system") applyThemePrefs(prefs);
  };
  mql.addEventListener("change", onSchemeChange);
  return () => {
    unsubscribe();
    mql.removeEventListener("change", onSchemeChange);
  };
}
