import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { MediaItem } from "../../lib/media";
import { Lightbox } from "./Lightbox";
import styles from "./Lightbox.module.css";

beforeAll(() => {
  // jsdom の版によっては showModal が無い
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "clipboard");
});

const ITEMS: MediaItem[] = [
  { url: "https://i.test/0.jpg" },
  { url: "https://i.test/1.jpg", alt: "二枚目" },
  { url: "https://i.test/2.jpg" },
];

function renderLightbox(items = ITEMS, index = 1, onClose = vi.fn()) {
  const result = render(<Lightbox items={items} index={index} onClose={onClose} />);
  return { ...result, onClose };
}

function image(): HTMLImageElement {
  const img = screen.getByRole("dialog", { name: "画像" }).querySelector("img");
  if (!img) throw new Error("img が無い");
  return img;
}

it("渡した番号の画像を原 URL で出し、n / N と「閉じる」へのフォーカス", () => {
  renderLightbox();

  expect(screen.getByRole("dialog", { name: "画像" })).toHaveAttribute("open");
  expect(screen.getByText("2 / 3")).toBeInTheDocument();
  expect(image()).toHaveAttribute("src", "https://i.test/1.jpg");
  expect(image().getAttribute("src")).not.toContain("wsrv.nl");
  expect(image()).toHaveAttribute("alt", "二枚目");
  expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
});

it("← → / Home / End で前後へ送り、端で止まる", async () => {
  renderLightbox();

  await userEvent.keyboard("{ArrowRight}");
  expect(screen.getByText("3 / 3")).toBeInTheDocument();
  expect(image()).toHaveAttribute("src", "https://i.test/2.jpg");
  await userEvent.keyboard("{ArrowRight}");
  expect(screen.getByText("3 / 3")).toBeInTheDocument();
  await userEvent.keyboard("{ArrowLeft}");
  expect(screen.getByText("2 / 3")).toBeInTheDocument();
  await userEvent.keyboard("{End}");
  expect(screen.getByText("3 / 3")).toBeInTheDocument();
  await userEvent.keyboard("{Home}");
  expect(screen.getByText("1 / 3")).toBeInTheDocument();
});

it("左右のボタンで前後へ送る", async () => {
  renderLightbox(ITEMS, 0);

  await userEvent.click(screen.getByRole("button", { name: "前の画像" }));
  expect(screen.getByText("1 / 3")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "次の画像" }));
  expect(screen.getByText("2 / 3")).toBeInTheDocument();
});

it("端の側のボタンは aria-disabled（押せるが何も起きない）", async () => {
  renderLightbox(ITEMS, 0);

  const prev = screen.getByRole("button", { name: "前の画像" });
  const next = screen.getByRole("button", { name: "次の画像" });
  expect(prev).toHaveAttribute("aria-disabled", "true");
  expect(prev).not.toBeDisabled();
  expect(next).not.toHaveAttribute("aria-disabled");

  await userEvent.keyboard("{End}");
  expect(prev).not.toHaveAttribute("aria-disabled");
  expect(next).toHaveAttribute("aria-disabled", "true");
});

it("Esc（cancel）と「閉じる」で onClose", async () => {
  const { onClose } = renderLightbox();

  const cancel = new Event("cancel", { cancelable: true });
  fireEvent(screen.getByRole("dialog"), cancel);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(cancel.defaultPrevented).toBe(true);

  await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
  expect(onClose).toHaveBeenCalledTimes(2);
});

it("背景のクリックで閉じる", () => {
  const { onClose } = renderLightbox();

  fireEvent.click(image().parentElement as HTMLElement);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("50px 以上の横スワイプで送り、それ未満では送らない。スワイプ後の click では閉じない", () => {
  const { onClose } = renderLightbox();

  fireEvent.pointerDown(image(), { clientX: 300, clientY: 100 });
  fireEvent.pointerUp(image(), { clientX: 200, clientY: 100 });
  fireEvent.click(image().parentElement as HTMLElement);
  expect(screen.getByText("3 / 3")).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();

  fireEvent.pointerDown(image(), { clientX: 200, clientY: 100 });
  fireEvent.pointerUp(image(), { clientX: 300, clientY: 100 });
  expect(screen.getByText("2 / 3")).toBeInTheDocument();

  fireEvent.pointerDown(image(), { clientX: 300, clientY: 100 });
  fireEvent.pointerUp(image(), { clientX: 270, clientY: 100 });
  expect(screen.getByText("2 / 3")).toBeInTheDocument();
});

it("画像のシングルクリックは少し待って閉じ、ダブルクリックは 2.5 倍の拡大を切り替えて閉じない", () => {
  vi.useFakeTimers();
  const { onClose } = renderLightbox();

  fireEvent.click(image(), { detail: 1 });
  fireEvent.click(image(), { detail: 2 });
  fireEvent.dblClick(image());
  act(() => {
    vi.advanceTimersByTime(300);
  });
  expect(onClose).not.toHaveBeenCalled();
  expect(image()).toHaveClass(styles.zoomed);

  // 拡大中のシングルクリックでは閉じない
  fireEvent.click(image(), { detail: 1 });
  act(() => {
    vi.advanceTimersByTime(300);
  });
  expect(onClose).not.toHaveBeenCalled();

  // click の detail が数えられない環境でも dblclick で切り替わる
  fireEvent.dblClick(image());
  expect(image()).not.toHaveClass(styles.zoomed);

  fireEvent.click(image(), { detail: 1 });
  expect(onClose).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(250);
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("画像を切り替えたら拡大を戻す", async () => {
  renderLightbox();

  fireEvent.dblClick(image());
  expect(image()).toHaveClass(styles.zoomed);
  await userEvent.keyboard("{ArrowRight}");
  expect(image()).not.toHaveClass(styles.zoomed);
});

it("「新しいタブで開く」は原 URL、「URL をコピー」は原 URL を書き込んで「コピーしました」になる", async () => {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  renderLightbox();

  const open = screen.getByRole("link", { name: "新しいタブで開く" });
  expect(open).toHaveAttribute("href", "https://i.test/1.jpg");
  expect(open).toHaveAttribute("target", "_blank");
  expect(open.getAttribute("rel")).toContain("noopener");

  await userEvent.click(screen.getByRole("button", { name: "URL をコピー" }));

  expect(writeText).toHaveBeenCalledWith("https://i.test/1.jpg");
  expect(await screen.findByRole("button", { name: "コピーしました" })).toBeInTheDocument();
});

it("コピーできたらボタンの文字が 1.5 秒だけ「コピーしました」になり、アイコンに戻る", async () => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(() => Promise.resolve()) },
  });
  renderLightbox();

  const button = screen.getByRole("button", { name: "URL をコピー" });
  expect(button.textContent).toBe("");
  await act(async () => {
    fireEvent.click(button);
  });
  expect(button).toHaveTextContent("コピーしました");
  expect(button).toHaveAttribute("aria-label", "コピーしました");

  act(() => {
    vi.advanceTimersByTime(1499);
  });
  expect(button).toHaveTextContent("コピーしました");
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(button.textContent).toBe("");
  expect(button).toHaveAttribute("aria-label", "URL をコピー");
  expect(button.querySelector("svg")).not.toBeNull();
});

it("読み込めなければ「画像を読み込めませんでした」を出し、別の画像へ送れば戻す", async () => {
  renderLightbox();

  fireEvent.error(image());
  expect(screen.getByText("画像を読み込めませんでした")).toBeInTheDocument();

  await userEvent.keyboard("{ArrowRight}");
  expect(screen.queryByText("画像を読み込めませんでした")).toBeNull();
  expect(image()).toHaveAttribute("src", "https://i.test/2.jpg");
});

it("1 枚だけなら前後のボタンと n / N を出さない", () => {
  renderLightbox([{ url: "https://i.test/only.jpg" }], 0);

  expect(screen.queryByRole("button", { name: "前の画像" })).toBeNull();
  expect(screen.queryByRole("button", { name: "次の画像" })).toBeNull();
  expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull();
});

it("開いている間は後ろの文書をスクロールさせず、閉じたら戻す", () => {
  document.body.style.overflow = "auto";
  const { unmount } = renderLightbox();
  expect(document.body.style.overflow).toBe("hidden");

  unmount();
  expect(document.body.style.overflow).toBe("auto");
  document.body.style.overflow = "";
});

it("履歴を積まない（戻るはモーダルの cancel として届く）", async () => {
  const pushState = vi.spyOn(history, "pushState");
  const replaceState = vi.spyOn(history, "replaceState");
  const length = history.length;
  const { unmount } = renderLightbox();

  await userEvent.keyboard("{ArrowRight}");
  await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
  unmount();

  expect(pushState).not.toHaveBeenCalled();
  expect(replaceState).not.toHaveBeenCalled();
  expect(history.length).toBe(length);
});
