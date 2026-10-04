import { create } from "zustand";
import { t } from "../../i18n";

// ---- 画像アップロードの圧縮設定（ネイティブ ImageCompressionPrefs。設定「画像アップロード先」の下） ----

/** 解像度プリセット（ネイティブ ImageResolution）。既定は「中」 */
export type ImageResolution = "low" | "mid" | "high";

export const COMPRESSION_KEY = "nostrism.media.compression";

/** 入力の許容範囲（ネイティブ ImageCompressionPrefs.MIN_DIM 等）。外れた値は保存時に丸める */
export const DIM_MIN = 128;
export const DIM_MAX = 8192;
export const QUALITY_MIN = 30;
export const QUALITY_MAX = 100;

/** 既定値（ネイティブ ImageCompressionPrefs.DEFAULT_*） */
export const DEFAULT_LOW_DIM = 640;
export const DEFAULT_MID_DIM = 1200;
export const DEFAULT_QUALITY = 85;

export type ImageCompressionPrefs = {
  lowMaxDim: number;
  midMaxDim: number;
  quality: number;
};

export const DEFAULT_COMPRESSION: ImageCompressionPrefs = {
  lowMaxDim: DEFAULT_LOW_DIM,
  midMaxDim: DEFAULT_MID_DIM,
  quality: DEFAULT_QUALITY,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 長辺の丸め（ネイティブ ImageCompressionPrefs.from と同じ範囲: 128〜8192） */
export function clampDim(n: number): number {
  return clamp(n, DIM_MIN, DIM_MAX);
}

/** 品質の丸め（同じく 30〜100） */
export function clampQuality(n: number): number {
  return clamp(n, QUALITY_MIN, QUALITY_MAX);
}

function readCompression(): ImageCompressionPrefs {
  try {
    const raw = localStorage.getItem(COMPRESSION_KEY);
    if (raw === null) return DEFAULT_COMPRESSION;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return DEFAULT_COMPRESSION;
    const v = value as Partial<Record<keyof ImageCompressionPrefs, unknown>>;
    return {
      lowMaxDim: typeof v.lowMaxDim === "number" ? clampDim(v.lowMaxDim) : DEFAULT_LOW_DIM,
      midMaxDim: typeof v.midMaxDim === "number" ? clampDim(v.midMaxDim) : DEFAULT_MID_DIM,
      quality: typeof v.quality === "number" ? clampQuality(v.quality) : DEFAULT_QUALITY,
    };
  } catch {
    return DEFAULT_COMPRESSION;
  }
}

/** 選んだ圧縮設定（画像アップロード時に使う） */
export const useImageCompression = create<{ prefs: ImageCompressionPrefs }>()(() => ({
  prefs: readCompression(),
}));

/** 変えた分だけ渡す。範囲外は丸めて保存する */
export function setImageCompression(patch: Partial<ImageCompressionPrefs>): void {
  const current = useImageCompression.getState().prefs;
  const next: ImageCompressionPrefs = {
    lowMaxDim: clampDim(patch.lowMaxDim ?? current.lowMaxDim),
    midMaxDim: clampDim(patch.midMaxDim ?? current.midMaxDim),
    quality: clampQuality(patch.quality ?? current.quality),
  };
  useImageCompression.setState({ prefs: next });
  try {
    localStorage.setItem(COMPRESSION_KEY, JSON.stringify(next));
  } catch {
    // 保存できなくてもこのセッションでは効く
  }
}

/** 既定に戻す */
export function resetImageCompression(): void {
  useImageCompression.setState({ prefs: DEFAULT_COMPRESSION });
  try {
    localStorage.removeItem(COMPRESSION_KEY);
  } catch {
    // 同上
  }
}

/**
 * 解像度プリセットの表示順（ネイティブ ImageResolution.entries）。投稿シート・チャット入力欄で共有する（CH4 / 挙動4.4）。
 */
export function resolutions(): readonly [ImageResolution, string][] {
  return [
    ["low", t("quality_low")],
    ["mid", t("quality_mid")],
    ["high", t("quality_high")],
  ];
}

/** プリセットに対応する長辺 px（ネイティブ maxDimFor）。高は null（縮小しない。ただし EXIF は消すため再エンコードはする） */
export function maxDimFor(resolution: ImageResolution, prefs: ImageCompressionPrefs): number | null {
  switch (resolution) {
    case "low":
      return prefs.lowMaxDim;
    case "mid":
      return prefs.midMaxDim;
    case "high":
      return null;
  }
}
