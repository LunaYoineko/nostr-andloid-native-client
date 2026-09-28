import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { npubEncode } from "nostr-tools/nip19";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "../../signer/session";
import { installDialogPolyfill } from "../../test/dialog";
import { PUBKEY, resetSession } from "../../test/fakeNostr";
import { clearViewport, mockViewport } from "../../test/viewport";
import { setDefaultReaction, useDefaultReaction } from "../actions/reactionPrefs";
import { clearCacheAndReload } from "./cache";
import { DEVELOPER_MODE_KEY, setDeveloperMode, useDeveloperMode } from "./devMode";
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
  setDeveloperMode(false);
  localStorage.clear();
});

function renderAt(path: string, width: number) {
  mockViewport(width);
  const router = createMemoryRouter(
    [
      { path: "/settings/:section?", element: <SettingsScreen /> },
      { path: "/p/:ref", element: <p>プロフィール画面</p> },
      { path: "/messages", element: <p>メッセージ画面</p> },
    ],
    { initialEntries: [path] },
  );
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
    expect(within(items()).getByRole("button", { name: "このアプリについて準備中" })).toBeInTheDocument();
    expect(within(items()).getByRole("button", { name: "ミュート" })).toBeInTheDocument();
    expect(within(items()).getByRole("button", { name: "リレー" })).toBeInTheDocument();

    await userEvent.click(within(items()).getByRole("button", { name: "リレー" }));
    expect(router.state.location.pathname).toBe("/settings/relays");
    expect(screen.getByRole("heading", { level: 1, name: "リレー" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "設定の項目" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "戻る" }));
    expect(router.state.location.pathname).toBe("/settings");
    expect(items()).toBeInTheDocument();

    await userEvent.click(within(items()).getByRole("button", { name: "このアプリについて準備中" }));
    expect(screen.getByText("この項目は準備中です")).toBeInTheDocument();
  });

  it("よく使うの「プロフィール」は自分のプロフィールを開き、「DM」はメッセージ画面へ切り替える", async () => {
    const router = renderAt("/settings", 400);
    expect(within(items()).getByRole("button", { name: "プロフィール" })).toBeInTheDocument();
    expect(within(items()).getByRole("button", { name: "DM" })).toBeInTheDocument();
    expect(within(items()).getByRole("button", { name: "ふぁぼ" })).toBeInTheDocument();

    await userEvent.click(within(items()).getByRole("button", { name: "プロフィール" }));
    expect(router.state.location.pathname).toBe(`/p/${npubEncode(PUBKEY)}`);
    expect(router.state.historyAction).toBe("PUSH");

    await act(() => router.navigate("/settings"));
    await userEvent.click(within(items()).getByRole("button", { name: "DM" }));
    expect(router.state.location.pathname).toBe("/messages");
    expect(router.state.historyAction).toBe("REPLACE");
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
  it("左に一覧・右に内容。未選択なら先頭のプロフィール（ネイティブ sections.first()）、選ぶと右が替わる（履歴は置き換え）", async () => {
    const router = renderAt("/settings", 1000);
    expect(within(items()).getByRole("button", { name: "プロフィール" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("region", { name: "プロフィール" })).toBeInTheDocument();

    await userEvent.click(within(items()).getByRole("button", { name: "表示" }));
    expect(router.state.location.pathname).toBe("/settings/display");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(within(items()).getByRole("button", { name: "表示" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("region", { name: "表示" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "プロフィール" })).not.toBeInTheDocument();
  });

  it("リアクション: 既定リアクションをスターにする（#587 で独立セクションに戻した）", async () => {
    setDefaultReaction("+", null);
    renderAt("/settings/reaction", 1000);
    expect(screen.getByRole("region", { name: "リアクション" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ハート" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "スター" }));
    expect(useDefaultReaction.getState()).toEqual({ content: "⭐", image: null });
    expect(screen.getByRole("button", { name: "スター" })).toHaveAttribute("aria-pressed", "true");
    setDefaultReaction("+", null);
  });

  it("カスタマイズの並びはネイティブと同じ: リアクション → カスタム絵文字 → ハッシュタグ → 表示。テーマストアは独立セクションではない（#587）", () => {
    renderAt("/settings", 1000);
    const heading = screen.getByRole("heading", { level: 2, name: "カスタマイズ" });
    const section = heading.closest("section");
    if (!section) throw new Error("section not found");
    expect(
      within(section)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["リアクション", "カスタム絵文字", "ハッシュタグ", "表示"]);
    expect(screen.queryByRole("button", { name: "テーマストア" })).toBeNull();
  });

  it("/settings/theme-store は /settings/display（表示。テーマストアから取得の導線行）に置き換える", async () => {
    const router = renderAt("/settings/theme-store", 1000);
    expect(router.state.location.pathname).toBe("/settings/display");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.getByRole("region", { name: "表示" })).toBeInTheDocument();
  });

  it("/settings/developer は /settings/data（データ・キャッシュ）に置き換える", async () => {
    const router = renderAt("/settings/developer", 1000);
    expect(router.state.location.pathname).toBe("/settings/data");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.getByRole("region", { name: "データ・キャッシュ" })).toBeInTheDocument();
    expect(within(items()).getByRole("button", { name: "データ・キャッシュ" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(items()).queryByRole("button", { name: "開発者" })).toBeNull();
  });

  it("データ・キャッシュ: 開発者モードの切り替えを保存する", async () => {
    renderAt("/settings/data", 1000);
    const toggle = screen.getByRole("checkbox", { name: "開発者モードを有効にする" });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(useDeveloperMode.getState().enabled).toBe(true);
    expect(localStorage.getItem(DEVELOPER_MODE_KEY)).toBe("true");
    await userEvent.click(toggle);
    expect(localStorage.getItem(DEVELOPER_MODE_KEY)).toBe("false");
  });

  it("データ・キャッシュ: 「接続と通信量を表示」で read / write リレーの状態・受信量・購読中の REQ 数", async () => {
    renderAt("/settings/data", 1000);
    await userEvent.click(screen.getByRole("button", { name: "接続と通信量を表示" }));
    const dialog = screen.getByRole("dialog", { name: "接続と通信量" });
    expect(within(dialog).getByText("購読中のREQ")).toBeInTheDocument();
    const connections = within(dialog).getByRole("list", { name: "リレーの接続状態" });
    const rows = within(connections).getAllByRole("listitem");
    expect(rows.length).toBeGreaterThan(0);
    // 既定リレー（en-US）= relay.damus.io / nos.lol の read + write。状態は他の画面の購読しだい
    expect(rows.map((r) => r.textContent?.match(/^[a-z.]+/)?.[0]).sort()).toEqual(
      expect.arrayContaining(["nos.lol", "relay.damus.io"]),
    );
    for (const row of rows.filter((r) => r.textContent?.includes("read · write"))) {
      expect(row).toHaveTextContent(/^(nos\.lol|relay\.damus\.io)(接続|接続中|切断)⬇ \d+B · \d+ev · REQ \d+/);
    }
    await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: "接続と通信量" })).toBeNull();
  });

  it("データ・キャッシュ: 「nostr: リンクをこのアプリで開く」は manifest と同じ scheme / URL で登録する（#541）", async () => {
    const registerProtocolHandler = vi.fn();
    Object.defineProperty(navigator, "registerProtocolHandler", {
      configurable: true,
      value: registerProtocolHandler,
    });
    renderAt("/settings/data", 1000);
    await userEvent.click(screen.getByRole("button", { name: "nostr: リンクをこのアプリで開く" }));
    expect(registerProtocolHandler).toHaveBeenCalledWith("web+nostr", "/app/open?uri=%s");
    Reflect.deleteProperty(navigator, "registerProtocolHandler");
  });

  it("データ・キャッシュ: registerProtocolHandler が無いブラウザでは出さない（#541）", () => {
    renderAt("/settings/data", 1000);
    expect(screen.queryByRole("button", { name: "nostr: リンクをこのアプリで開く" })).toBeNull();
  });

  it("データ・キャッシュ: キャッシュの強制消去は確認してから", async () => {
    renderAt("/settings/data", 1000);
    await userEvent.click(screen.getByRole("button", { name: "キャッシュを強制消去" }));
    const dialog = screen.getByRole("dialog", { name: "キャッシュを消去しますか？" });
    expect(dialog).toHaveTextContent("DM の復号済みメッセージも消えます");
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(vi.mocked(clearCacheAndReload)).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "キャッシュを強制消去" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "キャッシュを消去しますか？" })).getByRole("button", {
        name: "消去する",
      }),
    );
    expect(vi.mocked(clearCacheAndReload)).toHaveBeenCalledTimes(1);
  });
});
