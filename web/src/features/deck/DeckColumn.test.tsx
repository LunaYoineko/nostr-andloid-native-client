import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type ColumnSpec, columnSubtitleFor, DEFAULT_COLUMNS } from "../../lib/columns";
import { unixNow } from "../../lib/time";
import { eventStore } from "../../nostr/store";
import { useDeck } from "../../store/deck";
import { renderWithRouter } from "../../test/renderWithRouter";
import { DeckColumn } from "./DeckColumn";
import { useColumnFeed } from "./useColumnFeed";

// 購読はしない（本体は空のタイムライン）
vi.mock("./useColumnFeed", () => ({
  useColumnFeed: vi.fn(() => ({
    mode: "column",
    loading: false,
    events: [],
    loadingOlder: false,
    loadOlder: () => {},
    refresh: () => {},
  })),
}));

const DM: ColumnSpec = {
  id: "c_dm",
  title: "DM",
  subtitle: "NIP-17",
  kind: "DM",
  renderer: "FEED",
  filter: { ...DEFAULT_COLUMNS[0].filter, kinds: [14] },
  pinned: true,
  order: 3,
};

beforeEach(() => {
  useDeck.setState({ columns: [...DEFAULT_COLUMNS, DM], widths: {} });
});

afterEach(() => {
  localStorage.clear();
});

it("ヘッダにタイトルとサブタイトルを出す", () => {
  const [, hashtag] = DEFAULT_COLUMNS;
  render(<DeckColumn spec={hashtag} showHeader />);
  expect(screen.getByRole("heading", { name: "#nostr" })).toBeInTheDocument();
  expect(screen.getByText(columnSubtitleFor(hashtag))).toBeInTheDocument();
  expect(screen.getByText("まだ投稿がありません")).toBeInTheDocument();
});

it("左端のカラムのメニューでは「左へ移動」が押せない", async () => {
  const user = userEvent.setup();
  render(<DeckColumn spec={DEFAULT_COLUMNS[0]} showHeader />);
  await user.click(screen.getByRole("button", { name: "カラムメニュー" }));

  expect(screen.getByRole("menu")).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "左へ移動" })).toBeDisabled();
  expect(screen.getByRole("menuitem", { name: "右へ移動" })).toBeEnabled();
  // フォロー中は設定を持たないので「フィルターを編集」は出さない
  expect(screen.queryByRole("menuitem", { name: /フィルターを編集/ })).not.toBeInTheDocument();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("DM カラムは「まだ使えません」を出し、購読しない", () => {
  vi.mocked(useColumnFeed).mockClear();
  render(<DeckColumn spec={DM} showHeader />);
  expect(screen.getByText(/まだ使えません/)).toBeInTheDocument();
  expect(vi.mocked(useColumnFeed)).not.toHaveBeenCalled();
});

it("「カラムを削除」でカラムが消える", async () => {
  const user = userEvent.setup();
  render(<DeckColumn spec={DM} showHeader />);
  await user.click(screen.getByRole("button", { name: "カラムメニュー" }));
  await user.click(screen.getByRole("menuitem", { name: /カラムを削除/ }));

  expect(useDeck.getState().columns.map((c) => c.id)).toEqual(["c_following", "c_hashtag", "c_notif"]);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("ふぁぼ欄の行は「あなたがリアクション」の 1 行で、投稿全体（「返信」ボタン）は出さない（#459）", async () => {
  // jsdom に ResizeObserver が無い（Virtuoso が使う。寸法は VirtuosoMockContext が与える）
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  const FAVS: ColumnSpec = {
    id: "c_favs",
    title: "ふぁぼ欄",
    subtitle: "自分のリアクション",
    kind: "FAVS",
    renderer: "FEED",
    filter: { ...DEFAULT_COLUMNS[0].filter, kinds: [7] },
    pinned: false,
    order: 4,
  };
  const target = finalizeEvent(
    { kind: 1, created_at: unixNow(), tags: [], content: "ふぁぼった投稿" },
    generateSecretKey(),
  );
  eventStore.add(target);
  const reaction = finalizeEvent(
    {
      kind: 7,
      created_at: unixNow(),
      tags: [
        ["e", target.id],
        ["p", target.pubkey],
      ],
      content: "+",
    },
    generateSecretKey(),
  );
  const original = vi.mocked(useColumnFeed).getMockImplementation();
  vi.mocked(useColumnFeed).mockImplementation(() => ({
    mode: "column",
    loading: false,
    events: [reaction],
    loadingOlder: false,
    loadOlder: () => {},
    refresh: () => {},
  }));
  try {
    renderWithRouter(
      <VirtuosoMockContext.Provider value={{ viewportHeight: 2000, itemHeight: 100 }}>
        <DeckColumn spec={FAVS} showHeader />
      </VirtuosoMockContext.Provider>,
    );
    expect(await screen.findByText("あなたがリアクション")).toBeInTheDocument();
    expect(screen.getByText(/: ふぁぼった投稿$/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返信" })).toBeNull();
  } finally {
    if (original) vi.mocked(useColumnFeed).mockImplementation(original);
  }
});
