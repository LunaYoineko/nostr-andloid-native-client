import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, expect, it, vi } from "vitest";
import { installDialogPolyfill } from "../test/dialog";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./ConfirmDialog.module.css";

beforeAll(() => {
  installDialogPolyfill();
});

function renderDialog(destructive?: boolean) {
  const onConfirm = vi.fn();
  const onDismiss = vi.fn();
  render(
    <ConfirmDialog
      title="入力内容を破棄しますか？"
      text="作成中の本文と添付画像は保存されません。"
      confirmLabel="破棄する"
      destructive={destructive}
      onConfirm={onConfirm}
      onDismiss={onDismiss}
    />,
  );
  return { onConfirm, onDismiss };
}

it("見出し・本文で名前付けしたモーダルを開き、確認 / キャンセルを呼ぶ", async () => {
  const { onConfirm, onDismiss } = renderDialog();
  const dialog = screen.getByRole("dialog", { name: "入力内容を破棄しますか？" });
  expect(dialog).toHaveAttribute("open");
  expect(dialog).toHaveAccessibleDescription("作成中の本文と添付画像は保存されません。");

  await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "破棄する" }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it("cancel（Esc / 戻る）は閉じずにキャンセル扱い", () => {
  const { onConfirm, onDismiss } = renderDialog();
  const cancel = new Event("cancel", { cancelable: true });
  fireEvent(screen.getByRole("dialog"), cancel);
  expect(cancel.defaultPrevented).toBe(true);
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

it("destructive なら確認ボタンを警告色に", () => {
  renderDialog(true);
  expect(screen.getByRole("button", { name: "破棄する" })).toHaveClass(styles.destructive);
  expect(screen.getByRole("button", { name: "キャンセル" })).toHaveClass(styles.dismiss);
});
