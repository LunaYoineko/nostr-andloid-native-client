import { afterEach, expect, it, vi } from "vitest";
import {
  DARK_SCHEME_QUERY,
  DEFAULT_THEME_PREFS,
  initTheme,
  resolveTheme,
  setBoldText,
  setTextScale,
  setThemeMode,
  THEME_KEY,
  useThemePrefs,
} from "./themePrefs";

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
  localStorage.clear();
  useThemePrefs.setState(DEFAULT_THEME_PREFS);
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  root.removeAttribute("data-bold");
  root.style.removeProperty("--text-scale");
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.remove();
  // jsdom の window には matchMedia が無い。スタブを外して「無い」状態に戻す
  Reflect.deleteProperty(window, "matchMedia");
});

/** OS のダークモードを dark にした matchMedia のスタブ。set で切り替えると change を配る */
function mockColorScheme(dark: boolean) {
  let matches = dark;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  window.matchMedia = (query: string): MediaQueryList => {
    const mql = {
      media: query,
      get matches() {
        return query === DARK_SCHEME_QUERY && matches;
      },
      onchange: null,
      addEventListener(type: string, listener: (e: MediaQueryListEvent) => void) {
        if (type === "change" && query === DARK_SCHEME_QUERY) listeners.add(listener);
      },
      removeEventListener(type: string, listener: (e: MediaQueryListEvent) => void) {
        if (type === "change") listeners.delete(listener);
      },
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    };
    return mql as unknown as MediaQueryList;
  };
  return {
    set(next: boolean) {
      matches = next;
      for (const l of [...listeners]) l({ matches: next, media: DARK_SCHEME_QUERY } as MediaQueryListEvent);
    },
    listenerCount: () => listeners.size,
  };
}

const html = () => document.documentElement;
const themeColor = () =>
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.getAttribute("content");
const saved = () => JSON.parse(localStorage.getItem(THEME_KEY) ?? "null");

/** 保存値を入れてからモジュールを読み直し、初期値を返す */
async function initialWith(value: string | null) {
  if (value !== null) localStorage.setItem(THEME_KEY, value);
  vi.resetModules();
  const fresh = await import("./themePrefs");
  return fresh.useThemePrefs.getState();
}

it("初期値はダーク・小・太字オフ（ネイティブの既定）", async () => {
  expect(await initialWith(null)).toEqual({ mode: "dark", textScale: "s", bold: false });
});

it("保存値を初期値にする。壊れた JSON は既定、不正な項目はその項目だけ既定へ", async () => {
  expect(await initialWith(JSON.stringify({ mode: "system", textScale: "m", bold: true }))).toEqual({
    mode: "system",
    textScale: "m",
    bold: true,
  });
  localStorage.clear();
  expect(await initialWith("{broken")).toEqual(DEFAULT_THEME_PREFS);
  localStorage.clear();
  expect(await initialWith(JSON.stringify({ mode: "custom", textScale: "l", bold: "yes" }))).toEqual({
    mode: "dark",
    textScale: "l",
    bold: false,
  });
});

it("initTheme は保存値を同期的に <html> へ当てる（React の描画前・await なし）", async () => {
  localStorage.setItem(THEME_KEY, JSON.stringify({ mode: "light", textScale: "l", bold: true }));
  vi.resetModules();
  const fresh = await import("./themePrefs");

  dispose = fresh.initTheme();

  expect(html().dataset.theme).toBe("light");
  expect(html().style.getPropertyValue("--text-scale")).toBe("1.35");
  expect(html().hasAttribute("data-bold")).toBe(true);
  expect(themeColor()).toBe("#F2F2F5");
});

it("保存が無ければダーク・倍率 1・太字なし。theme-color はダークの背景", () => {
  dispose = initTheme();
  expect(html().dataset.theme).toBe("dark");
  expect(html().style.getPropertyValue("--text-scale")).toBe("1");
  expect(html().hasAttribute("data-bold")).toBe(false);
  expect(themeColor()).toBe("#0C0C10");
});

it("setThemeMode で保存し、data-theme と theme-color が変わる", () => {
  dispose = initTheme();

  setThemeMode("light");
  expect(saved()).toEqual({ mode: "light", textScale: "s", bold: false });
  expect(html().dataset.theme).toBe("light");
  expect(themeColor()).toBe("#F2F2F5");

  setThemeMode("dark");
  expect(saved()).toEqual({ mode: "dark", textScale: "s", bold: false });
  expect(html().dataset.theme).toBe("dark");
  expect(themeColor()).toBe("#0C0C10");
});

it("index.html の theme-color の meta を書き換える（増やさない）", () => {
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = "#0C0C10";
  document.head.append(meta);

  dispose = initTheme();
  setThemeMode("light");

  expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
  expect(meta.content).toBe("#F2F2F5");
});

it("system は OS のダークモードに従い、変化にも追従する", () => {
  const scheme = mockColorScheme(false);
  dispose = initTheme();
  setThemeMode("system");
  expect(html().dataset.theme).toBe("light");
  expect(themeColor()).toBe("#F2F2F5");

  scheme.set(true);
  expect(html().dataset.theme).toBe("dark");
  expect(themeColor()).toBe("#0C0C10");

  scheme.set(false);
  expect(html().dataset.theme).toBe("light");
});

it("system 以外のときは OS の変化を無視する", () => {
  const scheme = mockColorScheme(true);
  dispose = initTheme();
  setThemeMode("dark");

  scheme.set(false);
  expect(html().dataset.theme).toBe("dark");
});

it("解除すると OS の変化を聞かなくなる", () => {
  const scheme = mockColorScheme(false);
  dispose = initTheme();
  expect(scheme.listenerCount()).toBe(1);
  dispose();
  dispose = null;
  expect(scheme.listenerCount()).toBe(0);
});

it("resolveTheme: matchMedia が無ければ system はダーク", () => {
  expect(resolveTheme("system")).toBe("dark");
  expect(resolveTheme("light")).toBe("light");
  mockColorScheme(false);
  expect(resolveTheme("system")).toBe("light");
});

it("文字サイズは --text-scale に TextScale.factor（1 / 1.15 / 1.35）を入れて保存する", () => {
  dispose = initTheme();

  setTextScale("m");
  expect(html().style.getPropertyValue("--text-scale")).toBe("1.15");
  expect(saved()).toEqual({ mode: "dark", textScale: "m", bold: false });

  setTextScale("l");
  expect(html().style.getPropertyValue("--text-scale")).toBe("1.35");

  setTextScale("s");
  expect(html().style.getPropertyValue("--text-scale")).toBe("1");
});

it("太字は data-bold を付け外しして保存する", () => {
  dispose = initTheme();

  setBoldText(true);
  expect(html().hasAttribute("data-bold")).toBe(true);
  expect(saved()).toEqual({ mode: "dark", textScale: "s", bold: true });

  setBoldText(false);
  expect(html().hasAttribute("data-bold")).toBe(false);
});
