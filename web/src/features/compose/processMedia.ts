import { encode } from "blurhash";
import type { UploadFile } from "./nip96";

/**
 * 画像の圧縮（ネイティブ ImageCompressionPrefs の「中」の既定値。ComposeSheet の解像度の既定も「中」）。
 * 長辺をこの px 以下へ縮めて再エンコードする。
 */
export const IMAGE_MAX_DIM = 1200;
/** 再エンコードの品質（%。ネイティブ ImageCompressionPrefs.DEFAULT_QUALITY） */
export const IMAGE_QUALITY = 85;
/** blurhash を計算する縮小画像の長辺（px） */
const BLURHASH_DIM = 32;

export type MediaKind = "image" | "video";

/** アップロードする中身と、imeta に入れる手元で分かる値 */
export type ProcessedMedia = UploadFile & { dim?: { w: number; h: number }; blurhash?: string };

/** 添付できるファイルの種類（画像・動画以外は null） */
export function mediaKindOfFile(file: File): MediaKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

/** 拡張子を付け替える（ネイティブ: `name.substringBeforeLast('.', name) + ".webp"`） */
function renameTo(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  return `${dot < 0 ? name : name.slice(0, dot)}.${ext}`;
}

/** アニメーション WebP か（RIFF / WEBP / VP8X のフラグの Animation ビット） */
async function isAnimatedWebp(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 21).arrayBuffer());
  if (head.length < 21) return false;
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  return (
    ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP" && ascii(12, 16) === "VP8X" && (head[20] & 0x02) !== 0
  );
}

/** 圧縮しない画像（GIF・アニメーション WebP。再エンコードで動きが消える） */
async function keepOriginal(file: File): Promise<boolean> {
  if (file.type === "image/gif") return true;
  if (file.type === "image/webp") return isAnimatedWebp(file);
  return false;
}

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** WebP で書き出す（ネイティブ Android と同じ）。WebP を書けないブラウザは JPEG（ネイティブ iOS と同じ） */
async function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  const webp = await toBlob(canvas, "image/webp", quality);
  if (webp?.type === "image/webp") return webp;
  const jpeg = await toBlob(canvas, "image/jpeg", quality);
  return jpeg?.type === "image/jpeg" ? jpeg : null;
}

/** 縮小した画像から blurhash を計算する（縦長は 3×4、横長は 4×3 の成分）。失敗は undefined */
function blurhashOf(bitmap: ImageBitmap): string | undefined {
  try {
    const scale = Math.min(1, BLURHASH_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvasOf(w, h).getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    return w >= h ? encode(data, w, h, 4, 3) : encode(data, w, h, 3, 4);
  } catch {
    return undefined;
  }
}

/**
 * 画像を長辺 maxDim px 以下へ縮めて品質 quality% で再エンコードする（ネイティブ processImage）。
 * maxDim が null（解像度「高」）でも縮小しないだけで、再エンコードして EXIF（位置情報等）は必ず取り除く
 * （プラポリ 4.4「画像は送信前に端末内で縮小・再圧縮し、EXIF を取り除く」。ネイティブ Android の HIGH は
 * 無加工で元バイトを返すが、Web はここを優先してこの関数では常に再エンコードする）。
 * EXIF の向きは画素へ焼き込む（createImageBitmap の imageOrientation: "from-image"。再エンコードで EXIF は消える）。
 * GIF・アニメーション WebP は圧縮しない（再エンコードで動きが消えるため。EXIF は元々持たない形式）。
 * 読めない形式（ブラウザが対応していない HEIC 等）や失敗時は元のまま返す。
 * 寸法・blurhash は読めた画像なら付ける（imeta 用。maxDim が null でも付ける）。
 */
export async function processImage(
  file: File,
  maxDim: number | null = IMAGE_MAX_DIM,
  quality = IMAGE_QUALITY,
): Promise<ProcessedMedia> {
  const original: ProcessedMedia = {
    blob: file,
    mime: file.type || "image/jpeg",
    name: file.name || "image",
  };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return original;
  }
  try {
    const dim = { w: bitmap.width, h: bitmap.height };
    const blurhash = blurhashOf(bitmap);
    const withMeta: ProcessedMedia = { ...original, dim, blurhash };
    if (dim.w <= 0 || dim.h <= 0 || (await keepOriginal(file))) return withMeta;

    const scale = maxDim === null ? 1 : Math.min(1, maxDim / Math.max(dim.w, dim.h));
    const w = Math.max(1, Math.round(dim.w * scale));
    const h = Math.max(1, Math.round(dim.h * scale));
    const canvas = canvasOf(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return withMeta;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    const encoded = await encodeCanvas(canvas, quality / 100);
    if (!encoded) return withMeta;
    const ext = encoded.type === "image/webp" ? "webp" : "jpg";
    return { blob: encoded, mime: encoded.type, name: renameTo(original.name, ext), dim: { w, h }, blurhash };
  } catch {
    return original;
  } finally {
    bitmap.close();
  }
}

/** 動画は圧縮しない（原バイトのまま。ネイティブの解像度「高」= 無変換と同じ） */
export function processVideo(file: File): ProcessedMedia {
  return { blob: file, mime: file.type || "video/mp4", name: file.name || "video" };
}
