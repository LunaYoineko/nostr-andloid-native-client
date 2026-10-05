import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { MediaItem } from "../../lib/media";
import { useToast } from "../../ui/toast";
import { Lightbox, type LightboxEdit } from "./Lightbox";
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
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "clipboard");
  useToast.setState({ queue: [] });
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

function stage(): HTMLElement {
  return image().parentElement as HTMLElement;
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

it("2 本指のピンチで倍率が 1〜5 に収まる（inline style の width で決まる）", () => {
  renderLightbox();
  const el = stage();

  fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerDown(el, { pointerId: 2, clientX: 200, clientY: 100 }); // 距離 100
  fireEvent.pointerMove(el, { pointerId: 2, clientX: 500, clientY: 100 }); // 距離 400 → 倍率 4
  expect(image()).toHaveClass(styles.zoomed);
  expect(image().style.width).toBe("400%");

  // 上限 5 倍を超えない
  fireEvent.pointerMove(el, { pointerId: 2, clientX: 1000, clientY: 100 }); // 距離 900 → 倍率 9 のはずが 5 に収まる
  expect(image().style.width).toBe("500%");

  // ピンチの終わり（指を離す）は click として閉じたり拡大を変えたりしない
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(el, { pointerId: 2, clientX: 1000, clientY: 100 });
  fireEvent.click(image());
  expect(screen.getByText("2 / 3")).toBeInTheDocument();
  expect(image()).toHaveClass(styles.zoomed);
});

it("ピンチで縮めれば下限 1 倍で止まり、拡大が解ける", () => {
  renderLightbox();
  const el = stage();

  fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerDown(el, { pointerId: 2, clientX: 300, clientY: 100 }); // 距離 200
  fireEvent.pointerMove(el, { pointerId: 2, clientX: 700, clientY: 100 }); // 距離 600 → 倍率 3
  expect(image().style.width).toBe("300%");

  fireEvent.pointerMove(el, { pointerId: 2, clientX: 105, clientY: 100 }); // 距離 5 → 倍率 0.025 のはずが 1 に収まる
  expect(image()).not.toHaveClass(styles.zoomed);
});

it("等倍（1 倍）のときだけ横スワイプで前後へ送る", () => {
  renderLightbox();

  // ダブルクリックで 2.5 倍にすると、同じ移動量のスワイプでも送らない
  fireEvent.dblClick(image());
  expect(image()).toHaveClass(styles.zoomed);
  fireEvent.pointerDown(image(), { pointerId: 1, clientX: 300, clientY: 100 });
  fireEvent.pointerUp(image(), { pointerId: 1, clientX: 150, clientY: 100 });
  expect(screen.getByText("2 / 3")).toBeInTheDocument();

  fireEvent.dblClick(image());
  expect(image()).not.toHaveClass(styles.zoomed);
  fireEvent.pointerDown(image(), { pointerId: 1, clientX: 300, clientY: 100 });
  fireEvent.pointerUp(image(), { pointerId: 1, clientX: 150, clientY: 100 });
  expect(screen.getByText("3 / 3")).toBeInTheDocument();
});

it("画像を保存: fetch → Blob → <a download> で保存し、「保存しました」のトーストを出す", async () => {
  const blob = new Blob(["x"], { type: "image/jpeg" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(blob, { status: 200 })),
  );
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => "blob:test/1");
  URL.revokeObjectURL = vi.fn();
  let downloadName = "";
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadName = this.download;
  });

  renderLightbox();
  await userEvent.click(screen.getByRole("button", { name: "画像を保存" }));

  expect(fetch).toHaveBeenCalledWith("https://i.test/1.jpg");
  expect(downloadName).toBe("1.jpg");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
  expect(useToast.getState().queue).toContain("画像を保存しました");

  clickSpy.mockRestore();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

it("画像を保存: 読めなければ「保存に失敗しました」を出し、「新しいタブで開く」は残る", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 403 })),
  );

  renderLightbox();
  await userEvent.click(screen.getByRole("button", { name: "画像を保存" }));

  expect(useToast.getState().queue).toContain("保存に失敗しました");
  expect(screen.getByRole("link", { name: "新しいタブで開く" })).toHaveAttribute(
    "href",
    "https://i.test/1.jpg",
  );
});

function renderEditable(edit: Partial<LightboxEdit> = {}) {
  const onAction = vi.fn();
  const full: LightboxEdit = { canEdit: () => true, isEdited: () => false, onAction, ...edit };
  render(<Lightbox items={ITEMS} index={1} onClose={vi.fn()} edit={full} />);
  return { onAction };
}

it("編集メニュー: 添付のときだけ出る。投稿の画像（edit なし）には出ない", () => {
  renderLightbox();
  expect(screen.queryByRole("toolbar")).toBeNull();
  expect(screen.getByRole("button", { name: "画像を保存" })).toBeInTheDocument();
});

it("編集メニュー: 4 つの操作が表示中の画像の番号で呼ばれる。コピー・保存・新しいタブは出さない", async () => {
  const { onAction } = renderEditable({ isEdited: () => true });
  const toolbar = screen.getByRole("toolbar", { name: "画像の向きを編集" });
  expect(toolbar).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "右に回転" }));
  await userEvent.click(screen.getByRole("button", { name: "左に回転" }));
  await userEvent.click(screen.getByRole("button", { name: "左右反転" }));
  await userEvent.click(screen.getByRole("button", { name: "元に戻す" }));
  expect(onAction.mock.calls).toEqual([
    [1, "rotateRight"],
    [1, "rotateLeft"],
    [1, "flip"],
    [1, "reset"],
  ]);
  expect(screen.queryByRole("button", { name: "画像を保存" })).toBeNull();
  expect(screen.queryByRole("link", { name: "新しいタブで開く" })).toBeNull();
  expect(screen.queryByRole("button", { name: "URL をコピー" })).toBeNull();
});

it("編集メニュー: 編集していなければ「元に戻す」は押せない", async () => {
  const { onAction } = renderEditable();
  const reset = screen.getByRole("button", { name: "元に戻す" });
  expect(reset).toHaveAttribute("aria-disabled", "true");
  await userEvent.click(reset);
  expect(onAction).not.toHaveBeenCalled();
});

it("編集メニュー: 編集できない画像（GIF 等）では出さない", () => {
  renderEditable({ canEdit: () => false });
  expect(screen.queryByRole("toolbar")).toBeNull();
});
