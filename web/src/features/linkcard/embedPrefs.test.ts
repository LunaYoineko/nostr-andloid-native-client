import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_EMBED_PREFS, EMBED_PREFS_KEY, setEmbedPref, useEmbedPrefs } from "./embedPrefs";

afterEach(() => {
  localStorage.clear();
  useEmbedPrefs.setState(DEFAULT_EMBED_PREFS);
});

const saved = () => JSON.parse(localStorage.getItem(EMBED_PREFS_KEY) ?? "null");

/** 保存値を入れてからモジュールを読み直し、初期値を返す */
async function initialWith(value: string | null) {
  if (value !== null) localStorage.setItem(EMBED_PREFS_KEY, value);
  vi.resetModules();
  const fresh = await import("./embedPrefs");
  return fresh.useEmbedPrefs.getState();
}

it("初期値は 6 項目すべて true（ネイティブの既定）", async () => {
  expect(await initialWith(null)).toEqual(DEFAULT_EMBED_PREFS);
});

it("保存値を初期値にする。壊れた JSON は既定、不正な項目はその項目だけ既定へ", async () => {
  const saved = {
    video: false,
    youtube: false,
    spotify: false,
    ogp: false,
    ogpImages: false,
    hideCardedUrls: false,
  };
  expect(await initialWith(JSON.stringify(saved))).toEqual(saved);

  localStorage.clear();
  expect(await initialWith("{broken")).toEqual(DEFAULT_EMBED_PREFS);

  localStorage.clear();
  expect(await initialWith(JSON.stringify({ video: "no", ogp: false }))).toEqual({
    ...DEFAULT_EMBED_PREFS,
    ogp: false,
  });
});

it("setEmbedPref は 1 項目だけ変えて保存する（他の項目はそのまま）", () => {
  setEmbedPref("ogp", false);
  expect(useEmbedPrefs.getState()).toEqual({ ...DEFAULT_EMBED_PREFS, ogp: false });
  expect(saved()).toEqual({ ...DEFAULT_EMBED_PREFS, ogp: false });

  setEmbedPref("hideCardedUrls", false);
  expect(useEmbedPrefs.getState()).toEqual({ ...DEFAULT_EMBED_PREFS, ogp: false, hideCardedUrls: false });
  expect(saved()).toEqual({ ...DEFAULT_EMBED_PREFS, ogp: false, hideCardedUrls: false });
});
