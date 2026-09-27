import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type ColumnSpec, columnSubtitleFor, DEFAULT_COLUMNS } from "../../lib/columns";
import { useDeck } from "../../store/deck";
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
