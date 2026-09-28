import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requestZapInvoice } from "../../lib/lnurl";
import { installDialogPolyfill } from "../../test/dialog";
import { useToast } from "../../ui/toast";
import { ZAP_INVOICE_FAILED, ZAP_PAID, ZapDialog } from "./ZapDialog";

// LNURL の取得・署名はしない（lnurl.test.ts で見る）。invoice の取得の呼ばれ方だけ見る
vi.mock("../../lib/lnurl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/lnurl")>();
  return { ...actual, requestZapInvoice: vi.fn() };
});

const PR = "lnbc210n1ptestinvoice";
const RECIPIENT = "c".repeat(64);
const NOTE_ID = "d".repeat(64);

beforeAll(() => {
  installDialogPolyfill();
});

beforeEach(() => {
  vi.mocked(requestZapInvoice).mockReset();
  vi.mocked(requestZapInvoice).mockResolvedValue(PR);
});

afterEach(() => {
  Reflect.deleteProperty(window, "webln");
  Reflect.deleteProperty(navigator, "clipboard");
  useToast.setState({ queue: [] });
});

function renderDialog(
  props: { eventId?: string; targetKind?: number } = { eventId: NOTE_ID, targetKind: 1 },
) {
  const onClose = vi.fn();
  render(
    <ZapDialog
      recipient={RECIPIENT}
      recipientName="アリス"
      lud16="alice@example.com"
      {...props}
      onClose={onClose}
    />,
  );
  return { onClose, dialog: screen.getByRole("dialog", { name: "⚡ Zap" }) };
}

function installWebln(sendPayment = vi.fn(async () => ({ preimage: "00" }))) {
  const webln = { enable: vi.fn(async () => {}), sendPayment };
  Object.defineProperty(window, "webln", { value: webln, configurable: true, writable: true });
  return webln;
}

it("見出し・説明・送信先。既定は 100 sats", () => {
  const { dialog } = renderDialog();
  expect(
    within(dialog).getByText("アリス へ投げ銭します。金額を選び、ウォレットで支払ってください。"),
  ).toBeInTheDocument();
  expect(within(dialog).getByText("送信先: alice@example.com")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "100" })).toHaveAttribute("aria-pressed", "true");
  expect(within(dialog).getByRole("button", { name: "⚡ 100" })).toBeInTheDocument();
  for (const sats of ["21", "500", "1000", "5000", "10000"]) {
    expect(within(dialog).getByRole("button", { name: sats })).toHaveAttribute("aria-pressed", "false");
  }
});

it("カスタム額（数字だけ）がプリセットより優先。投稿への Zap は e / k を渡す", async () => {
  const user = userEvent.setup();
  installWebln();
  const { dialog } = renderDialog();

  await user.click(within(dialog).getByRole("button", { name: "500" }));
  expect(within(dialog).getByRole("button", { name: "⚡ 500" })).toBeInTheDocument();
  await user.type(within(dialog).getByRole("textbox", { name: "カスタム額 (sats)" }), "2a1b0");
  expect(within(dialog).getByRole("textbox", { name: "カスタム額 (sats)" })).toHaveValue("210");
  expect(within(dialog).getByRole("button", { name: "500" })).toHaveAttribute("aria-pressed", "false");
  await user.type(within(dialog).getByRole("textbox", { name: "コメント（任意）" }), "ありがとう");
  await user.click(within(dialog).getByRole("button", { name: "⚡ 210" }));

  await waitFor(() => expect(requestZapInvoice).toHaveBeenCalledTimes(1));
  expect(requestZapInvoice).toHaveBeenCalledWith({
    recipient: RECIPIENT,
    lud16: "alice@example.com",
    amountSats: 210,
    comment: "ありがとう",
    eventId: NOTE_ID,
    targetKind: 1,
  });
});

it("window.webln があれば enable → sendPayment(pr)、成功でトーストを出して閉じる", async () => {
  const user = userEvent.setup();
  const webln = installWebln();
  const { dialog, onClose } = renderDialog();

  await user.click(within(dialog).getByRole("button", { name: "⚡ 100" }));

  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(webln.enable).toHaveBeenCalledTimes(1);
  expect(webln.sendPayment).toHaveBeenCalledWith(PR);
  expect(useToast.getState().queue).toEqual([ZAP_PAID]);
});

it("処理中はスピナーで、Esc でも閉じない", async () => {
  const user = userEvent.setup();
  let resolve: (pr: string | null) => void = () => {};
  vi.mocked(requestZapInvoice).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { dialog, onClose } = renderDialog();

  await user.click(within(dialog).getByRole("button", { name: "⚡ 100" }));
  expect(dialog).toHaveAttribute("aria-busy", "true");
  expect(within(dialog).queryByRole("button", { name: "キャンセル" })).toBeNull();
  expect(within(dialog).queryByRole("button", { name: /⚡/ })).toBeNull();
  dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  expect(onClose).not.toHaveBeenCalled();

  resolve(PR);
  expect(await within(dialog).findByRole("button", { name: "閉じる" })).toBeInTheDocument();
  expect(dialog).toHaveAttribute("aria-busy", "false");
});

it("ウォレットが無ければ QR・「外部ウォレットで開く」・コピーを閉じるまで出す（プロフィール Zap は e / k なし）", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  const { dialog, onClose } = renderDialog({});

  await user.click(within(dialog).getByRole("button", { name: "⚡ 100" }));

  expect(await within(dialog).findByRole("img", { name: "Zap の invoice（100 sats）" })).toBeInTheDocument();
  expect(requestZapInvoice).toHaveBeenCalledWith(
    expect.objectContaining({ amountSats: 100, eventId: undefined, targetKind: undefined }),
  );
  expect(within(dialog).getByRole("link", { name: "外部ウォレットで開く" })).toHaveAttribute(
    "href",
    `lightning:${PR}`,
  );
  await user.click(within(dialog).getByRole("button", { name: "コピー" }));
  expect(writeText).toHaveBeenCalledWith(PR);
  expect(within(dialog).getByRole("status")).toHaveTextContent("コピーしました");
  expect(onClose).not.toHaveBeenCalled();
  expect(useToast.getState().queue).toEqual([]);

  await user.click(within(dialog).getByRole("button", { name: "閉じる" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

describe("失敗", () => {
  it("invoice が取れなければ zap_invoice_failed を出し、もう一度送れる", async () => {
    const user = userEvent.setup();
    vi.mocked(requestZapInvoice).mockResolvedValue(null);
    const { dialog, onClose } = renderDialog();

    await user.click(within(dialog).getByRole("button", { name: "⚡ 100" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(ZAP_INVOICE_FAILED);
    expect(within(dialog).getByRole("button", { name: "⚡ 100" })).toBeEnabled();
    expect(within(dialog).queryByRole("img")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("WebLN が拒否したらエラーを出して QR・リンク・コピーに切り替える", async () => {
    const user = userEvent.setup();
    installWebln(
      vi.fn(async () => {
        throw new Error("User rejected");
      }),
    );
    const { dialog, onClose } = renderDialog();

    await user.click(within(dialog).getByRole("button", { name: "⚡ 100" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("送金に失敗しました: User rejected");
    expect(within(dialog).getByRole("img", { name: "Zap の invoice（100 sats）" })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "外部ウォレットで開く" })).toHaveAttribute(
      "href",
      `lightning:${PR}`,
    );
    expect(within(dialog).getByRole("button", { name: "コピー" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(useToast.getState().queue).toEqual([]);
  });
});

it("payWithWallet（#537 の口）があれば WebLN より先にそれで払う", async () => {
  const user = userEvent.setup();
  const webln = installWebln();
  const payWithWallet = vi.fn(async () => {});
  const onClose = vi.fn();
  render(
    <ZapDialog
      recipient={RECIPIENT}
      recipientName="アリス"
      lud16="alice@example.com"
      payWithWallet={payWithWallet}
      onClose={onClose}
    />,
  );

  await user.click(screen.getByRole("button", { name: "⚡ 100" }));

  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(payWithWallet).toHaveBeenCalledWith(PR);
  expect(webln.sendPayment).not.toHaveBeenCalled();
});

it("キャンセル・Esc で閉じる", async () => {
  const user = userEvent.setup();
  const { dialog, onClose } = renderDialog();
  await user.click(within(dialog).getByRole("button", { name: "キャンセル" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  expect(onClose).toHaveBeenCalledTimes(2);
});
