import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { clearViewport, mockViewport } from "../test/viewport";
import { DetailOverlay } from "./DetailOverlay";

afterEach(() => {
  clearViewport();
});

it("Expanded のスレッドはスクリムを持ち、押すと閉じる", async () => {
  mockViewport(1400);
  const onClose = vi.fn();
  render(
    <DetailOverlay kind="thread" label="スレッド" onClose={onClose}>
      本文
    </DetailOverlay>,
  );

  await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("region", { name: "スレッド" })).toHaveTextContent("本文");
});

it("Compact のスレッドと Expanded のプロフィールはスクリムを持たない（全面）", () => {
  mockViewport(400);
  const { unmount } = render(
    <DetailOverlay kind="thread" label="スレッド" onClose={() => {}}>
      本文
    </DetailOverlay>,
  );
  expect(screen.queryByRole("button", { name: "閉じる" })).not.toBeInTheDocument();
  unmount();

  mockViewport(1400);
  render(
    <DetailOverlay kind="profile" label="プロフィール" onClose={() => {}}>
      本文
    </DetailOverlay>,
  );
  expect(screen.getByRole("region", { name: "プロフィール" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "閉じる" })).not.toBeInTheDocument();
});

it("Esc で 1 回閉じる。開いている <dialog> や入力欄の上では閉じない", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(
    <DetailOverlay kind="thread" label="スレッド" onClose={onClose}>
      <input aria-label="入力" />
    </DetailOverlay>,
  );

  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("textbox", { name: "入力" }));
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);

  screen.getByRole("textbox", { name: "入力" }).blur();
  const dialog = document.createElement("dialog");
  dialog.setAttribute("open", "");
  document.body.append(dialog);
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);
  dialog.remove();
});

function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        開く
      </button>
      {open && (
        <DetailOverlay kind="profile" label="プロフィール" onClose={() => setOpen(false)}>
          本文
        </DetailOverlay>
      )}
    </>
  );
}

it("開くと枠にフォーカスし、閉じると元のボタンへ戻す", async () => {
  const user = userEvent.setup();
  render(<Opener />);
  const opener = screen.getByRole("button", { name: "開く" });

  await user.click(opener);
  expect(screen.getByRole("region", { name: "プロフィール" })).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "プロフィール" })).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});
