import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { UpdateToast } from "./UpdateToast";

// 仮想モジュールは vite-plugin-pwa が生成する（テストでは SW を登録しない）
const updateServiceWorker = vi.hoisted(() => vi.fn(async (_reloadPage?: boolean) => {}));
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [true, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
}));

it("新しい SW が待機中ならトーストを出し、再読み込みで updateServiceWorker(true) を呼ぶ", async () => {
  render(<UpdateToast />);

  expect(screen.getByRole("status")).toHaveTextContent("新しいバージョンがあります");
  await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));

  expect(updateServiceWorker).toHaveBeenCalledWith(true);
});
