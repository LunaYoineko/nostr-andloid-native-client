import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setDataSaver } from "../../lib/imageProxy";
import type { MediaItem } from "../../lib/media";
import { ImageGrid } from "./ImageGrid";
import styles from "./ImageGrid.module.css";
import thumbStyles from "./Thumb.module.css";

const BLURHASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

beforeEach(() => {
  // jsdom は canvas の 2D コンテキストを持たない（null を返す）。「未実装」の警告だけ黙らせる
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  setDataSaver(false);
});

function images(count: number, host = "i.test"): MediaItem[] {
  return Array.from({ length: count }, (_, i) => ({ url: `https://${host}/${i}.jpg` }));
}

function renderGrid(items: MediaItem[], onOpen = vi.fn()) {
  return render(<ImageGrid images={items} onOpen={onOpen} />);
}

/** 描画中の唯一の <img> の src（alt="" の img は role で引けない） */
function imgSrc(): string | null {
  const imgs = document.querySelectorAll("img");
  expect(imgs).toHaveLength(1);
  return imgs[0].getAttribute("src");
}

it("1 枚は imeta の dim の比（0.75〜2 に丸める）で高さを確保し、800px 幅のプロキシで読む", () => {
  for (const [dim, ratio] of [
    [{ w: 1920, h: 1080 }, 1920 / 1080],
    [{ w: 4000, h: 1000 }, 2],
    [{ w: 1000, h: 4000 }, 0.75],
  ] as const) {
    const { unmount } = renderGrid([{ url: "https://i.test/a.jpg", dim }]);
    const one = screen.getByRole("button").parentElement;
    // jsdom は "1.7777777777777777 / 1" の形に正規化する
    expect(Number.parseFloat(one?.style.aspectRatio ?? "")).toBeCloseTo(ratio, 5);
    expect(one).not.toHaveClass(styles.single);
    expect(imgSrc()).toContain("w=800");
    unmount();
  }
});

it("dim の無い 1 枚は高さ固定（.single）", () => {
  renderGrid([{ url: "https://i.test/a.jpg" }]);

  const one = screen.getByRole("button").parentElement;
  expect(one).toHaveClass(styles.single);
  expect(one?.style.aspectRatio).toBe("");
});

it("2 / 4 枚は 2 列、3 / 5 / 9 枚は 3 列のグリッドで 400px 幅のプロキシ", () => {
  for (const [count, columns] of [
    [2, styles.cols2],
    [4, styles.cols2],
    [3, styles.cols3],
    [5, styles.cols3],
    [9, styles.cols3],
  ] as const) {
    const { container, unmount } = renderGrid(images(count));
    const grid = container.firstElementChild;
    expect(grid).toHaveClass(styles.grid, columns);
    expect(grid?.querySelectorAll("button")).toHaveLength(count);
    for (const img of container.querySelectorAll("img")) expect(img.getAttribute("src")).toContain("w=400");
    unmount();
  }
});

it("10 枚以上は横スクロールのカルーセルで 280px 幅のプロキシ", () => {
  const { container } = renderGrid(images(10));

  const carousel = container.getElementsByClassName(styles.carousel)[0];
  expect(carousel.querySelectorAll("button")).toHaveLength(10);
  for (const img of container.querySelectorAll("img")) expect(img.getAttribute("src")).toContain("w=280");
});

it("データセーバー中はアニメーションを止める（n=-1 を付けない）", () => {
  setDataSaver(false);
  const { unmount } = renderGrid(images(1));
  expect(imgSrc()).toContain("n=-1");
  unmount();

  setDataSaver(true);
  renderGrid(images(1));
  expect(imgSrc()).not.toContain("n=-1");
});

it("alt は imeta の値（無ければ空）、ボタンは「画像 n / N を拡大」で押すと onOpen(index)", async () => {
  const onOpen = vi.fn();
  const { container } = renderGrid(
    [
      { url: "https://i.test/0.jpg", alt: "猫の写真" },
      { url: "https://i.test/1.jpg" },
      { url: "https://i.test/2.jpg" },
    ],
    onOpen,
  );

  const alts = [...container.querySelectorAll("img")].map((img) => img.getAttribute("alt"));
  expect(alts).toEqual(["猫の写真", "", ""]);

  await userEvent.click(screen.getByRole("button", { name: "画像 2 / 3 を拡大" }));

  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenCalledWith(1);
});

it("blurhash があれば 20×20 の canvas を敷く（2D コンテキストが無くても落ちない）", () => {
  const { container } = renderGrid([{ url: "https://i.test/a.jpg", blurhash: BLURHASH }]);

  const canvases = container.querySelectorAll("canvas");
  expect(canvases).toHaveLength(1);
  expect(canvases[0]).toHaveAttribute("width", "20");
  expect(canvases[0]).toHaveAttribute("height", "20");
  expect(canvases[0]).toHaveAttribute("aria-hidden", "true");
});

it("読み込めたら blurhash をフェードで消す", () => {
  const { container } = renderGrid([{ url: "https://i.test/a.jpg", blurhash: BLURHASH }]);

  const canvas = container.querySelector("canvas");
  expect(canvas).not.toHaveClass(thumbStyles.faded);
  fireEvent.load(container.querySelector("img") as HTMLImageElement);
  expect(canvas).toHaveClass(thumbStyles.faded);
});

it("プロキシが読めなければ 1 度だけ原 URL で取り直し、それも駄目なら img を隠して blurhash を残す", () => {
  const url = "https://grid-blocked.test/a.jpg";
  const { container } = renderGrid([{ url, blurhash: BLURHASH }]);
  const img = container.querySelector("img") as HTMLImageElement;
  expect(img.getAttribute("src")).toContain("wsrv.nl");

  fireEvent.error(img);
  expect(img.getAttribute("src")).toBe(url);
  expect(img).not.toHaveClass(thumbStyles.hidden);

  fireEvent.error(img);
  expect(img).toHaveClass(thumbStyles.hidden);
  expect(container.querySelector("canvas")).not.toBeNull();
  // 押せば（ライトボックスで）取り直せる
  expect(screen.getByRole("button")).toBeEnabled();
});

it("blurhash が無ければ失敗時に「画像を読み込めませんでした」の箱になる", () => {
  const { container } = renderGrid([{ url: "https://grid-failed.test/a.jpg" }]);
  const img = container.querySelector("img") as HTMLImageElement;

  fireEvent.error(img);
  fireEvent.error(img);

  expect(screen.getByRole("button")).toHaveAttribute("title", "画像を読み込めませんでした");
});

it("http(s) でない URL は img を出さない", () => {
  const { container } = renderGrid([{ url: "javascript:alert(1)" }]);

  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByRole("button", { name: "画像 1 / 1 を拡大" })).toBeInTheDocument();
});
