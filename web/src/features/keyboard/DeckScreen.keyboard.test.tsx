import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { neventEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { createMemoryRouter, RouterProvider } from "react-router";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DeckScreen } from "../../app/deck/DeckScreen";
import { type ColumnSpec, DEFAULT_COLUMNS } from "../../lib/columns";
import { unixNow } from "../../lib/time";
import { useDeck } from "../../store/deck";
import { installDialogPolyfill } from "../../test/dialog";
import { clearViewport, mockViewport } from "../../test/viewport";
import { reactWithDefault } from "../actions/reactions";
import { useCompose } from "../compose/composeStore";
import type { ColumnFeed } from "../deck/useColumnFeed";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { INITIAL_KEYBOARD_STATE, useKeyboard } from "./kbStore";

const KEY = generateSecretKey();
const NOW = unixNow();

function posts(prefix: string, count: number): NostrEvent[] {
  return Array.from({ length: count }, (_, i) =>
    finalizeEvent({ kind: 1, created_at: NOW - i * 60, tags: [], content: `${prefix} ${i}` }, KEY),
  );
}

// カラムごとの中身（描画のたびに同じ配列・同じ結果を返す）
const { FEEDS, EMPTY_FEED } = vi.hoisted(() => {
  const empty: ColumnFeed = {
    mode: "column",
    loading: false,
    events: [],
    loadingOlder: false,
    loadOlder: () => {},
    refresh: () => {},
  };
  return { FEEDS: new Map<string, ColumnFeed>(), EMPTY_FEED: empty };
});
const FOLLOWING = posts("フォロー", 5);
const HASHTAG = posts("タグ", 3);
FEEDS.set("c_following", { ...EMPTY_FEED, mode: "following", events: FOLLOWING });
FEEDS.set("c_hashtag", { ...EMPTY_FEED, events: HASHTAG });

// 購読はしない
vi.mock("../deck/useColumnFeed", () => ({
  useColumnFeed: (spec: ColumnSpec) => FEEDS.get(spec.id) ?? EMPTY_FEED,
}));

// 発行しない
vi.mock("../actions/reactions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../actions/reactions")>()),
  reactWithDefault: vi.fn(() => Promise.resolve()),
}));

beforeAll(() => {
  installDialogPolyfill();
  // jsdom に ResizeObserver が無い（Virtuoso が使う。寸法は VirtuosoMockContext が与える）
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  localStorage.clear();
  useDeck.setState({
    columns: structuredClone([...DEFAULT_COLUMNS]),
    widths: {},
    jumpTarget: null,
    visibleColumnId: null,
    editingColumnId: null,
    showAddColumn: false,
  });
  useKeyboard.setState({ ...INITIAL_KEYBOARD_STATE });
  useCompose.setState({ request: null });
  vi.mocked(reactWithDefault).mockClear();
  mockViewport(1200);
});

afterEach(() => {
  clearViewport();
});

/** デッキ + ショートカットを / に描き、/e/:ref と /search へ移れるルータ */
function renderDeck() {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <VirtuosoMockContext.Provider value={{ viewportHeight: 1000, itemHeight: 100 }}>
            <DeckScreen />
            <KeyboardShortcuts enabled hasDetail={false} />
          </VirtuosoMockContext.Provider>
        ),
      },
      { path: "/e/:ref", element: <p>スレッド</p> },
      { path: "/search", element: <input id="search-query" type="search" aria-label="検索語" /> },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

/** body で押す。既定の動作を止めたら true */
function press(key: string, init: KeyboardEventInit = {}): boolean {
  return !fireEvent.keyDown(document.body, { key, ...init });
}

/** カラム（id）で選択中の行の index（無ければ null） */
function selectedRow(columnId: string): number | null {
  const column = document.getElementById(`deck-col-${columnId}`);
  if (!column) throw new Error(`カラム ${columnId} が無い`);
  const rows = column.querySelectorAll<HTMLElement>("[data-kb-selected]");
  if (rows.length > 1) throw new Error("選択中の行が複数ある");
  return rows.length === 0 ? null : Number(rows[0].dataset.kbIndex);
}

describe("選択と移動", () => {
  it("j で選択が 1 進みハイライトが付く。k で戻り、範囲の外へは出ない", () => {
    renderDeck();
    expect(selectedRow("c_following")).toBeNull();

    expect(press("j")).toBe(true);
    expect(selectedRow("c_following")).toBe(0);
    press("j");
    expect(selectedRow("c_following")).toBe(1);
    press("ArrowDown");
    expect(selectedRow("c_following")).toBe(2);
    press("k");
    press("ArrowUp");
    press("k");
    expect(selectedRow("c_following")).toBe(0);

    press("G", { shiftKey: true });
    expect(selectedRow("c_following")).toBe(4);
    press("j");
    expect(selectedRow("c_following")).toBe(4);
    press("g");
    expect(selectedRow("c_following")).toBe(0);
  });

  it("l で次のカラムへ（選択が無ければ 0、そのカラムへスクロール）、h で戻ると前の選択のまま", () => {
    renderDeck();
    press("j");
    press("j");
    press("l");
    expect(useKeyboard.getState().focusColumnId).toBe("c_hashtag");
    expect(selectedRow("c_hashtag")).toBe(0);
    expect(selectedRow("c_following")).toBeNull();
    // jump はデッキが消費する
    expect(useDeck.getState().jumpTarget).toBeNull();

    press("j");
    press("h");
    expect(selectedRow("c_following")).toBe(1);
    expect(selectedRow("c_hashtag")).toBeNull();
    // 左端より左へは行かない
    press("ArrowLeft");
    expect(useKeyboard.getState().focusColumnId).toBe("c_following");
  });

  it("Esc で選択を解除する（次の j は前の位置から）", () => {
    renderDeck();
    press("j");
    press("j");
    expect(press("Escape")).toBe(true);
    expect(selectedRow("c_following")).toBeNull();
    // 閉じるものが無ければ止めない
    expect(press("Escape")).toBe(false);
    press("j");
    expect(selectedRow("c_following")).toBe(2);
  });

  it("カラムを消したら選択も消す", () => {
    renderDeck();
    press("l");
    press("j");
    act(() => useDeck.getState().removeColumn("c_hashtag"));
    expect(useKeyboard.getState().selected).not.toHaveProperty("c_hashtag");
    expect(useKeyboard.getState().focusColumnId).toBeNull();
  });

  it("入力欄にフォーカスがあるとき・IME 変換中・修飾キー付きは何もしない", () => {
    renderDeck();
    const input = document.createElement("input");
    document.body.append(input);
    expect(fireEvent.keyDown(input, { key: "j" })).toBe(true);
    input.remove();
    expect(press("j", { isComposing: true })).toBe(false);
    expect(press("r", { ctrlKey: true })).toBe(false);
    expect(selectedRow("c_following")).toBeNull();
  });
});

describe("選択中の投稿への操作", () => {
  it("Enter でスレッドの URL へ", () => {
    const router = renderDeck();
    press("j");
    press("j");
    press("Enter");
    const target = FOLLOWING[1];
    expect(router.state.location.pathname).toBe(
      `/e/${neventEncode({ id: target.id, author: target.pubkey })}`,
    );
  });

  it("o でも開く。選択が無ければ何もしない", () => {
    const router = renderDeck();
    press("o");
    expect(router.state.location.pathname).toBe("/");
    press("j");
    press("o");
    const target = FOLLOWING[0];
    expect(router.state.location.pathname).toBe(
      `/e/${neventEncode({ id: target.id, author: target.pubkey })}`,
    );
  });

  it("r で返信、t で引用のコンポーザ。f で既定リアクション（確認なし）", () => {
    renderDeck();
    press("j");
    press("r");
    expect(useCompose.getState().request).toEqual({ mode: "reply", target: FOLLOWING[0] });
    act(() => useCompose.setState({ request: null }));

    press("j");
    press("t");
    expect(useCompose.getState().request).toEqual({ mode: "quote", target: FOLLOWING[1] });
    act(() => useCompose.setState({ request: null }));

    press("f");
    expect(reactWithDefault).toHaveBeenCalledWith(FOLLOWING[1]);
  });

  it("コンポーザが開いている間は効かない", () => {
    renderDeck();
    press("n");
    expect(useCompose.getState().request).toEqual({ mode: "new" });
    expect(press("j")).toBe(false);
    expect(selectedRow("c_following")).toBeNull();
  });
});

describe("画面", () => {
  it("n でコンポーザ（新規）", () => {
    renderDeck();
    expect(press("n")).toBe(true);
    expect(useCompose.getState().request).toEqual({ mode: "new" });
  });

  it("? で一覧を開き、Esc で閉じる。? でも閉じる", () => {
    renderDeck();
    press("?", { shiftKey: true });
    const dialog = screen.getByRole("dialog", { name: "キーボードショートカット" });
    expect(dialog).toHaveTextContent("次の投稿");
    expect(dialog).toHaveTextContent("Esc または画面タップで閉じる");
    // 開いている間は j 等は効かない
    press("j");
    expect(selectedRow("c_following")).toBeNull();

    expect(press("Escape")).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    press("?", { shiftKey: true });
    press("?", { shiftKey: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("一覧はスクリムを押すと閉じる", () => {
    renderDeck();
    press("?", { shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("/ で検索画面へ移り、検索欄にフォーカスする", async () => {
    const router = renderDeck();
    press("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/search"));
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "検索語" })).toHaveFocus());
  });
});
