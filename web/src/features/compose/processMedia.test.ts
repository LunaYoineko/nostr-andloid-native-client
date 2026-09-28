import { isBlurhashValid } from "blurhash";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MAX_DIM, mediaKindOfFile, processImage, processVideo } from "./processMedia";

// jsdom には createImageBitmap と canvas の描画が無いのでモックする

type Size = { width: number; height: number };

const canvases: Size[] = [];
const toBlobCalls: { type: string | undefined; quality: unknown }[] = [];
/** toBlob が返す MIME（WebP を書けないブラウザは PNG を返す） */
let encodeAs: (type: string | undefined) => string;

function stubBitmap(width: number, height: number) {
  const bitmap = { width, height, close: vi.fn() };
  const create = vi.fn(async () => bitmap);
  vi.stubGlobal("createImageBitmap", create);
  return { bitmap, create };
}

beforeEach(() => {
  canvases.length = 0;
  toBlobCalls.length = 0;
  encodeAs = (type) => type ?? "image/png";
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    canvases.push({ width: this.width, height: this.height });
    return {
      imageSmoothingQuality: "low",
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4).fill(128),
      }),
    } as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, type, quality) => {
    toBlobCalls.push({ type, quality });
    callback(new Blob(["encoded"], { type: encodeAs(type) }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function file(bytes: BlobPart[], name: string, type: string): File {
  return new File(bytes, name, { type });
}

/** RIFF / WEBP / VP8X（フラグ 1 バイト）の先頭 21 バイト */
function webpHeader(flags: number): Uint8Array<ArrayBuffer> {
  const head = new Uint8Array(new ArrayBuffer(21));
  head.set(new TextEncoder().encode("RIFF"), 0);
  head.set(new TextEncoder().encode("WEBPVP8X"), 8);
  head[20] = flags;
  return head;
}

describe("processImage", () => {
  it("長辺 1200px へ縮めて WebP 品質 0.85 で再エンコード。EXIF の向きは from-image。寸法と blurhash も付ける", async () => {
    const { bitmap, create } = stubBitmap(4000, 3000);
    const src = file(["x".repeat(5000)], "photo.jpg", "image/jpeg");

    const out = await processImage(src);

    expect(create).toHaveBeenCalledWith(src, { imageOrientation: "from-image" });
    expect(canvases).toContainEqual({ width: IMAGE_MAX_DIM, height: 900 });
    expect(toBlobCalls[0]).toEqual({ type: "image/webp", quality: 0.85 });
    expect(out).toMatchObject({ mime: "image/webp", name: "photo.webp", dim: { w: 1200, h: 900 } });
    expect(out.blob.type).toBe("image/webp");
    expect(isBlurhashValid(out.blurhash ?? "").result).toBe(true);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("長辺が 1200px 以下なら拡大せず、そのまま再エンコードする（EXIF を落とす）", async () => {
    stubBitmap(600, 800);
    const out = await processImage(file(["x"], "small.png", "image/png"));
    expect(canvases).toContainEqual({ width: 600, height: 800 });
    expect(out).toMatchObject({ mime: "image/webp", name: "small.webp", dim: { w: 600, h: 800 } });
  });

  it("WebP を書けないブラウザは JPEG", async () => {
    stubBitmap(2000, 1000);
    encodeAs = (type) => (type === "image/webp" ? "image/png" : (type ?? "image/png"));
    const out = await processImage(file(["x"], "a.heic", "image/heic"));
    expect(toBlobCalls.map((c) => c.type)).toEqual(["image/webp", "image/jpeg"]);
    expect(out).toMatchObject({ mime: "image/jpeg", name: "a.jpg", dim: { w: 1200, h: 600 } });
  });

  it("GIF・アニメーション WebP は元のまま（寸法と blurhash だけ付ける）", async () => {
    stubBitmap(320, 240);
    const gif = file(["GIF89a"], "anim.gif", "image/gif");
    const gifOut = await processImage(gif);
    expect(gifOut.blob).toBe(gif);
    expect(gifOut).toMatchObject({ mime: "image/gif", name: "anim.gif", dim: { w: 320, h: 240 } });
    expect(gifOut.blurhash).toBeTruthy();

    const animated = file([webpHeader(0x02)], "anim.webp", "image/webp");
    expect((await processImage(animated)).blob).toBe(animated);
    expect(toBlobCalls).toEqual([]);

    // 静止画の WebP（Animation ビットなし）は圧縮する
    const still = file([webpHeader(0x10)], "still.webp", "image/webp");
    expect((await processImage(still)).blob).not.toBe(still);
  });

  it("解像度「低」「高」: 低は長辺 640px、高（maxDim=null）は無加工で元のファイルのまま", async () => {
    stubBitmap(2000, 1000);
    const low = await processImage(file(["x"], "a.png", "image/png"), 640, 85);
    expect(canvases).toContainEqual({ width: 640, height: 320 });
    expect(low).toMatchObject({ mime: "image/webp", name: "a.webp", dim: { w: 640, h: 320 } });

    toBlobCalls.length = 0;
    const src = file(["x"], "b.jpg", "image/jpeg");
    const high = await processImage(src, null, 85);
    expect(high.blob).toBe(src);
    expect(high).toMatchObject({ mime: "image/jpeg", name: "b.jpg", dim: { w: 2000, h: 1000 } });
    expect(toBlobCalls).toEqual([]);
    expect(isBlurhashValid(high.blurhash ?? "").result).toBe(true);
  });

  it("読めない画像は元のまま（寸法・blurhash なし）", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new DOMException("decode", "InvalidStateError");
      }),
    );
    const src = file(["?"], "x.heic", "image/heic");
    expect(await processImage(src)).toEqual({ blob: src, mime: "image/heic", name: "x.heic" });
  });
});

describe("processVideo / mediaKindOfFile", () => {
  it("動画は圧縮しない。MIME が空なら video/mp4", () => {
    const src = file(["v"], "clip.mov", "video/quicktime");
    expect(processVideo(src)).toEqual({ blob: src, mime: "video/quicktime", name: "clip.mov" });
    expect(processVideo(file(["v"], "", "")).mime).toBe("video/mp4");
  });

  it("画像・動画以外は null", () => {
    expect(mediaKindOfFile(file(["x"], "a.png", "image/png"))).toBe("image");
    expect(mediaKindOfFile(file(["x"], "a.mp4", "video/mp4"))).toBe("video");
    expect(mediaKindOfFile(file(["x"], "a.pdf", "application/pdf"))).toBeNull();
  });
});
