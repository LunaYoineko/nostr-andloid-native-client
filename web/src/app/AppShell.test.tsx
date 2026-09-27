import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { noteEncode, npubEncode } from "nostr-tools/nip19";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnSpec } from "../lib/columns";
import { DEFAULT_COLUMNS } from "../lib/columns";
import { shortNpub } from "../lib/npub";
import { useSession } from "../signer/session";
import { useDeck } from "../store/deck";
import { installDialogPolyfill } from "../test/dialog";
import { OTHER_PUBKEY, PUBKEY, resetSession } from "../test/fakeNostr";
import { clearViewport, mockViewport } from "../test/viewport";
import { routes } from "./routes";

// カラムの中身（購読・仮想リスト）とダイアログは描かない
vi.mock("../features/deck/DeckColumn", () => ({
  DeckColumn: ({ spec, showHeader }: { spec: ColumnSpec; showHeader: boolean }) => (
    <div data-testid={`col-${spec.id}`} data-header={String(showHeader)} />
  ),
  ColumnMenu: () => <button type="button">カラムメニュー</button>,
}));
// 通知画面の購読もしない（空の一覧）
vi.mock("../features/deck/useColumnFeed", () => ({
  useColumnFeed: () => ({
    mode: "column",
    loading: false,
    events: [],
    loadingOlder: false,
    loadOlder: () => {},
    refresh: () => {},
  }),
}));
vi.mock("../features/deck/AddColumnDialog", () => ({ AddColumnDialog: () => <div role="dialog" /> }));
vi.mock("../features/deck/EditColumnDialog", () => ({ EditColumnDialog: () => <div role="dialog" /> }));

const NOTE = noteEncode("5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36");

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "");
  useDeck.setState({
    columns: structuredClone([...DEFAULT_COLUMNS]),
    widths: {},
    jumpTarget: null,
    visibleColumnId: null,
    editingColumnId: null,
    showAddColumn: false,
  });
  useSession.setState({ status: "in", method: "nip07", pubkey: PUBKEY });
});

afterEach(() => {
  clearViewport();
  resetSession();
});

function renderAt(initialEntries: string[], width = 400) {
  mockViewport(width);
  const router = createMemoryRouter(routes, { initialEntries });
  render(<RouterProvider router={router} />);
  return router;
}

function mainNav() {
  return screen.getByRole("navigation", { name: "メイン" });
}

/** レール・下部ナビのボタンの名前（DOM の順） */
function navLabels() {
  return within(mainNav())
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label"));
}

function currentNavLabels() {
  return within(mainNav())
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-current") === "page")
    .map((b) => b.getAttribute("aria-label"));
}

describe("骨格", () => {
  it("compact: 下部ナビ（5 つ）と main。レールは無い", () => {
    renderAt(["/"]);
    expect(navLabels()).toEqual(["ホーム", "検索", "メッセージ", "通知", "設定"]);
    expect(screen.getAllByRole("navigation", { name: "メイン" })).toHaveLength(1);
    expect(screen.queryByRole("img", { name: "Nostrism" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("expanded: レールに目次 3 件。通知カラムがあれば通知ボタンは出さず、消すと出る", () => {
    renderAt(["/"], 1200);
    expect(within(mainNav()).getByRole("img", { name: "Nostrism" })).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "メイン" })).toHaveLength(1);
    expect(navLabels()).toEqual([
      "ホーム",
      "フォロー中",
      "#nostr",
      "通知",
      "カラム追加",
      "検索",
      "メッセージ",
      "設定",
    ]);

    act(() => {
      useDeck.getState().removeColumn("c_notif");
    });
    expect(navLabels()).toEqual([
      "ホーム",
      "フォロー中",
      "#nostr",
      "カラム追加",
      "検索",
      "メッセージ",
      "通知",
      "設定",
    ]);
  });
});

describe("宛先", () => {
  it.each([
    ["/search", "検索", "検索"],
    ["/notifications", "通知", "通知"],
    ["/messages", "メッセージ", "メッセージ"],
    ["/settings", "設定", "設定"],
    ["/settings/relays", "設定", "設定"],
  ])("%s は見出し「%s」とナビの「%s」を選択表示する", async (path, heading, nav) => {
    renderAt([path]);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(currentNavLabels()).toEqual([nav]);
  });

  it("/notifications は通知画面（通知の一覧。準備中の文言は無い）", async () => {
    renderAt(["/notifications"]);
    expect(await screen.findByRole("heading", { name: "通知" })).toBeInTheDocument();
    expect(screen.getByText("通知はまだありません")).toBeInTheDocument();
    expect(screen.queryByText(/準備中/)).not.toBeInTheDocument();
    expect(currentNavLabels()).toEqual(["通知"]);
  });

  it("設定のログアウトで未ログインになり /login?next=%2Fsettings へ", async () => {
    installDialogPolyfill();
    const router = renderAt(["/settings"]);
    await userEvent.click(await screen.findByRole("button", { name: "ログアウト" }));
    const dialog = screen.getByRole("dialog", { name: "ログアウトしますか？" });
    await userEvent.click(within(dialog).getByRole("button", { name: "ログアウト" }));
    expect(useSession.getState().status).toBe("out");
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toBe("?next=%2Fsettings");
  });

  it("未定義のパスは「ページが見つかりません」とデッキへのリンク。どのナビも選択しない", async () => {
    renderAt(["/no/such/path"]);
    expect(await screen.findByRole("heading", { name: "ページが見つかりません" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "デッキへ戻る" })).toHaveAttribute("href", "/");
    expect(
      within(mainNav())
        .getAllByRole("button")
        .some((b) => b.hasAttribute("aria-current")),
    ).toBe(false);
  });
});

describe("詳細", () => {
  it("/e/<note1…> はデッキを背後に残したままスレッドを重ね、背後を inert にする", () => {
    renderAt([`/e/${NOTE}`]);
    expect(screen.getByTestId("col-c_following")).toBeInTheDocument();
    const thread = screen.getByRole("region", { name: "スレッド" });
    expect(within(thread).getByRole("button", { name: "戻る" })).toBeInTheDocument();
    expect(within(thread).getByText("読み込み中…")).toBeInTheDocument();
    expect(screen.getByRole("main").firstElementChild).toHaveAttribute("inert");
  });

  it("/e/zzz は「URL が正しくありません」", () => {
    renderAt(["/e/zzz"]);
    expect(screen.getByText("URL が正しくありません")).toBeInTheDocument();
  });

  it("/p/<npub1…> はプロフィールを重ね、見出しは名前（未取得なら npub の短縮）", () => {
    renderAt([`/p/${npubEncode(OTHER_PUBKEY)}`]);
    const profile = screen.getByRole("region", { name: "プロフィール" });
    expect(
      within(profile).getByRole("heading", { level: 1, name: shortNpub(OTHER_PUBKEY) }),
    ).toBeInTheDocument();
  });

  it("背後の宛先を保ち、「戻る」はアプリ内の履歴があれば戻り、無ければデッキへ置き換える", async () => {
    const user = userEvent.setup();
    const router = renderAt(["/search"]);
    await act(() => router.navigate(`/e/${NOTE}`));
    expect(screen.getByRole("heading", { name: "検索", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "スレッド" })).toBeInTheDocument();

    window.history.replaceState({ idx: 1 }, "");
    await user.click(screen.getByRole("button", { name: "戻る" }));
    expect(router.state.location.pathname).toBe("/search");
    expect(screen.queryByRole("region", { name: "スレッド" })).not.toBeInTheDocument();

    await act(() => router.navigate(`/e/${NOTE}`));
    window.history.replaceState(null, "");
    await user.click(screen.getByRole("button", { name: "戻る" }));
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.historyAction).toBe("REPLACE");
  });
});

describe("ナビ", () => {
  it("「検索」は /search へ置き換える", async () => {
    const router = renderAt(["/"]);
    await userEvent.click(within(mainNav()).getByRole("button", { name: "検索" }));
    expect(router.state.location.pathname).toBe("/search");
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("「通知」は通知カラムがあればそこへ jump し、無ければ通知画面へ", async () => {
    const user = userEvent.setup();
    const router = renderAt(["/"]);
    await user.click(within(mainNav()).getByRole("button", { name: "通知" }));
    expect(router.state.location.pathname).toBe("/");
    expect(useDeck.getState().jumpTarget).toBeNull();
    expect(useDeck.getState().visibleColumnId).toBe("c_notif");
    expect(currentNavLabels()).toEqual(["通知"]);

    act(() => {
      useDeck.getState().removeColumn("c_notif");
    });
    await user.click(within(mainNav()).getByRole("button", { name: "通知" }));
    expect(router.state.location.pathname).toBe("/notifications");
  });

  it("検索画面で「ホーム」を押すとデッキへ戻ってフォロー中へ jump する", async () => {
    useDeck.setState({ visibleColumnId: "c_notif" });
    const router = renderAt(["/search"]);
    await userEvent.click(within(mainNav()).getByRole("button", { name: "ホーム" }));
    expect(router.state.location.pathname).toBe("/");
    expect(useDeck.getState().jumpTarget).toBeNull();
    expect(useDeck.getState().visibleColumnId).toBe("c_following");
  });

  it("expanded: レールの目次はデッキへ戻ってそのカラムへ jump する", async () => {
    const targets: string[] = [];
    const unsubscribe = useDeck.subscribe((s) => {
      if (s.jumpTarget !== null) targets.push(s.jumpTarget);
    });
    const router = renderAt(["/search"], 1200);
    await userEvent.click(within(mainNav()).getByRole("button", { name: "#nostr" }));
    unsubscribe();
    expect(router.state.location.pathname).toBe("/");
    expect(targets).toEqual(["c_hashtag"]);
    expect(useDeck.getState().jumpTarget).toBeNull();
  });

  it("宛先の外で jump したらデッキへ出る", async () => {
    const router = renderAt(["/search"]);
    act(() => {
      useDeck.getState().jumpTo("c_notif");
    });
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("一時カラム（/t/:tag）", () => {
  it("一時カラムを開いて / に置き換え、戻るとそのカラムを閉じる", async () => {
    const router = renderAt(["/", "/t/bitcoin"]);
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/"));
    const last = useDeck.getState().columns.at(-1);
    expect(last).toMatchObject({ title: "#bitcoin", pinned: false });
    expect(router.state.location.state).toEqual({ deckTransient: last?.id });

    await act(() => router.navigate(-1));
    expect(useDeck.getState().columns.map((c) => c.id)).toEqual(["c_following", "c_hashtag", "c_notif"]);
  });

  it("固定済みのタグ（#nostr）は既存カラムへ jump し、戻っても閉じない", async () => {
    const router = renderAt(["/", "/t/nostr"]);
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.state).toEqual({ deckTransient: "c_hashtag" });

    await act(() => router.navigate(-1));
    expect(useDeck.getState().columns.map((c) => c.id)).toEqual(["c_following", "c_hashtag", "c_notif"]);
  });
});

describe("投稿ボタン", () => {
  it("デッキ（/）には「投稿」を出す", () => {
    renderAt(["/"]);
    expect(screen.getByRole("button", { name: "投稿" })).toBeInTheDocument();
  });

  it("検索では出さない", async () => {
    renderAt(["/search"]);
    expect(await screen.findByRole("heading", { name: "検索" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "投稿" })).toBeNull();
  });

  it("スレッドの詳細では出さない", () => {
    renderAt([`/e/${NOTE}`]);
    expect(screen.getByRole("region", { name: "スレッド" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "投稿" })).toBeNull();
  });
});
