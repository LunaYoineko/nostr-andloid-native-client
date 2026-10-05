import { isBlurhashValid } from "blurhash";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MAX_DIM, mediaKindOfFile, processImage, processVideo } from "./processMedia";

// jsdom には createImageBitmap と canvas の描画が無いのでモックする

type Size = { width: number; height: number };

const canvases: Size[] = [];
/** canvas ごとの setTransform の引数と drawImage の引数 */
const transforms: number[][] = [];
const draws: number[][] = [];
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
  transforms.length = 0;
  draws.length = 0;
  toBlobCalls.length = 0;
  encodeAs = (type) => type ?? "image/png";
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    canvases.push({ width: this.width, height: this.height });
    return {
      imageSmoothingQuality: "low",
      setTransform: (...m: number[]) => transforms.push(m),
      drawImage: (_bitmap: unknown, ...rest: number[]) => draws.push(rest),
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

  it("右に 90° 回すと canvas の縦横を入れ替え、dim も編集後の寸法になる。変換は反転 → 回転の順", async () => {
    stubBitmap(600, 800);
    const out = await processImage(file(["x"], "a.png", "image/png"), IMAGE_MAX_DIM, 85, {
      rotation: 90,
      flip: false,
    });
    // 書き出す canvas（最後。blurhash 用の縮小 canvas はその前）
    expect(canvases.at(-1)).toEqual({ width: 800, height: 600 });
    expect(out.dim).toEqual({ w: 800, h: 600 });
    expect(transforms.at(-1)).toEqual([0, 1, -1, 0, 400, 300]);
    expect(draws.at(-1)).toEqual([-300, -400, 600, 800]);
  });

  it("縮小と一緒に編集する: 4000x3000 を左右反転 + 270° → 900x1200", async () => {
    stubBitmap(4000, 3000);
    const out = await processImage(file(["x"], "a.jpg", "image/jpeg"), IMAGE_MAX_DIM, 85, {
      rotation: 270,
      flip: true,
    });
    expect(out.dim).toEqual({ w: 900, h: 1200 });
    expect(canvases.at(-1)).toEqual({ width: 900, height: 1200 });
    expect(draws.at(-1)).toEqual([-600, -450, 1200, 900]);
  });

  it("180° は寸法が変わらない。解像度「高」でも編集したら原寸のまま再エンコードする", async () => {
    stubBitmap(3000, 2000);
    const out = await processImage(file(["x"], "a.jpg", "image/jpeg"), null, 95, {
      rotation: 180,
      flip: false,
    });
    expect(out.dim).toEqual({ w: 3000, h: 2000 });
    expect(out.blob.type).toBe("image/webp");
    expect(toBlobCalls[0]).toEqual({ type: "image/webp", quality: 0.95 });
  });

  it("編集は blurhash の元画像にも効く（縦長にすると 3×4 の成分）", async () => {
    stubBitmap(800, 600);
    const plain = await processImage(file(["x"], "a.png", "image/png"));
    const turned = await processImage(file(["x"], "a.png", "image/png"), IMAGE_MAX_DIM, 85, {
      rotation: 90,
      flip: false,
    });
    // 成分数は blurhash の先頭 1 文字（(x-1) + (y-1) * 9）。横長 4×3 と縦長 3×4 で変わる
    expect(plain.blurhash?.[0]).not.toBe(turned.blurhash?.[0]);
  });

  it("GIF・アニメーション WebP は編集しても元のまま（寸法も変えない）", async () => {
    stubBitmap(320, 240);
    const gif = file(["GIF89a"], "anim.gif", "image/gif");
    const out = await processImage(gif, IMAGE_MAX_DIM, 85, { rotation: 90, flip: true });
    expect(out.blob).toBe(gif);
    expect(out.dim).toEqual({ w: 320, h: 240 });
    expect(toBlobCalls).toEqual([]);
  });

  it("解像度「低」は長辺 640px へ縮める", async () => {
    stubBitmap(2000, 1000);
    const low = await processImage(file(["x"], "a.png", "image/png"), 640, 85);
    expect(canvases).toContainEqual({ width: 640, height: 320 });
    expect(low).toMatchObject({ mime: "image/webp", name: "a.webp", dim: { w: 640, h: 320 } });
  });

  it("解像度「高」（maxDim=null）は縮小しないが、EXIF を落とすため再エンコードする（プラポリ 4.4）", async () => {
    stubBitmap(2000, 1000);
    const src = file(["x"], "b.jpg", "image/jpeg");
    const high = await processImage(src, null, 85);
    // 寸法は元のまま。ただし別の Blob に再エンコードされる（元ファイルをそのまま返さない）
    expect(canvases).toContainEqual({ width: 2000, height: 1000 });
    expect(toBlobCalls[0]).toEqual({ type: "image/webp", quality: 0.85 });
    expect(high.blob).not.toBe(src);
    expect(high).toMatchObject({ mime: "image/webp", name: "b.webp", dim: { w: 2000, h: 1000 } });
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
