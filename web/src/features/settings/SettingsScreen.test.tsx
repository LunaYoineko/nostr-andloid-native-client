import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "../../signer/session";
import { installDialogPolyfill } from "../../test/dialog";
import { PUBKEY, resetSession } from "../../test/fakeNostr";
import { clearViewport, mockViewport } from "../../test/viewport";
import { setDefaultReaction, useDefaultReaction } from "../actions/reactionPrefs";
import { clearCacheAndReload } from "./cache";
import { SettingsScreen } from "./SettingsScreen";

// キャッシュ消去は DB を消して再読み込みするので差し替える（消す範囲は cache.test.ts）
vi.mock("./cache", () => ({ clearCacheAndReload: vi.fn(async () => {}) }));

beforeAll(() => {
  installDialogPolyfill();
});

beforeEach(() => {
  useSession.setState({ status: "in", method: "nip07", pubkey: PUBKEY });
  vi.mocked(clearCacheAndReload).mockClear();
});

afterEach(() => {
  clearViewport();
  resetSession();
});

function renderAt(path: string, width: number) {
  mockViewport(width);
  const router = createMemoryRouter([{ path: "/settings/:section?", element: <SettingsScreen /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

function items() {
  return screen.getByRole("navigation", { name: "設定の項目" });
}

describe("Compact", () => {
  it("一覧 → 項目 →「←」で一覧へ戻る。M1 に無い項目は準備中", async () => {
    const router = renderAt("/settings", 400);
    expect(screen.getByRole("heading", { level: 1, name: "設定" })).toBeInTheDocument();
    expect(within(items()).getByRole("button", { name: "ミュート準備中" })).toBeInTheDocument();
    expect(within(items()).getByRole("button", { name: "リレー" })).toBeInTheDocument();

    await userEvent.click(within(items()).getByRole("button", { name: "リレー" }));
    expect(router.state.location.pathname).toBe("/settings/relays");
    expect(screen.getByRole("heading", { level: 1, name: "リレー" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "設定の項目" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "戻る" }));
    expect(router.state.location.pathname).toBe("/settings");
    expect(items()).toBeInTheDocument();

    await userEvent.click(within(items()).getByRole("button", { name: "ミュート準備中" }));
    expect(screen.getByText("この項目は準備中です")).toBeInTheDocument();
  });

  it("直接開いた項目の「←」は一覧へ置き換える", async () => {
    const router = renderAt("/settings/display", 400);
    await userEvent.click(screen.getByRole("button", { name: "戻る" }));
    expect(router.state.location.pathname).toBe("/settings");
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("先頭のアカウント行でアカウントを開く（npub・ログイン方式・ログアウト）", async () => {
    renderAt("/settings", 400);
    await userEvent.click(screen.getAllByRole("button", { name: /npub1/ })[0]);
    const account = screen.getByRole("region", { name: "アカウント" });
    expect(within(account).getByText(/^npub1/)).toBeInTheDocument();
    expect(within(account).getByText("拡張機能（NIP-07）")).toBeInTheDocument();
    expect(within(account).getByRole("button", { name: "ログアウト" })).toBeInTheDocument();
  });
});

describe("Expanded", () => {
  it("左に一覧・右に内容。未選択ならアカウント、選ぶと右が替わる（履歴は置き換え）", async () => {
    const router = renderAt("/settings", 1000);
    expect(within(items()).getByRole("button", { name: "アカウント" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("region", { name: "アカウント" })).toBeInTheDocument();

    await userEvent.click(within(items()).getByRole("button", { name: "表示" }));
    expect(router.state.location.pathname).toBe("/settings/display");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(within(items()).getByRole("button", { name: "表示" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("region", { name: "表示" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "アカウント" })).not.toBeInTheDocument();
  });

  it("表示: 既定リアクションをスターにする", async () => {
    setDefaultReaction("+", null);
    renderAt("/settings/display", 1000);
    expect(screen.getByRole("button", { name: "ハート" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "スター" }));
    expect(useDefaultReaction.getState()).toEqual({ content: "⭐", image: null });
    expect(screen.getByRole("button", { name: "スター" })).toHaveAttribute("aria-pressed", "true");
    setDefaultReaction("+", null);
  });

  it("開発者: 接続状態に read / write リレーを出し、キャッシュ消去は確認してから", async () => {
    renderAt("/settings/developer", 1000);
    const connections = screen.getByRole("list", { name: "リレーの接続状態" });
    expect(within(connections).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(within(connections).getAllByRole("listitem")[0]).toHaveTextContent("未接続");

    await userEvent.click(screen.getByRole("button", { name: "キャッシュを消去" }));
    const dialog = screen.getByRole("dialog", { name: "キャッシュを消去しますか？" });
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(vi.mocked(clearCacheAndReload)).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "キャッシュを消去" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "キャッシュを消去しますか？" })).getByRole("button", {
        name: "消去する",
      }),
    );
    expect(vi.mocked(clearCacheAndReload)).toHaveBeenCalledTimes(1);
  });
});
