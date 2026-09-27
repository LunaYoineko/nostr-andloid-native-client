import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { npubEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { createMemoryRouter, RouterProvider } from "react-router";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type ColumnSpec, columnSubtitleFor, DEFAULT_COLUMNS, decodeDeckColumns } from "../../lib/columns";
import { unixNow } from "../../lib/time";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { useDeck } from "../../store/deck";
import { OTHER_PUBKEY, PUBKEY } from "../../test/fakeNostr";
import { renderWithRouter } from "../../test/renderWithRouter";
import { startDecrypting } from "../dm/dmService";
import { useDm } from "../dm/dmStore";
import { DeckColumn } from "./DeckColumn";
import { useColumnFeed } from "./useColumnFeed";

// DM の購読・復号はしない（状態はストアへ直接入れる）
vi.mock("../dm/dmService", () => ({ startDecrypting: vi.fn(), resumeDecrypting: vi.fn() }));

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

/** Web 版でまだ描けない種別 */
const THREAD: ColumnSpec = { ...DM, id: "c_thread", title: "スレッド", kind: "THREAD", renderer: "THREAD" };

beforeEach(() => {
  useDeck.setState({ columns: [...DEFAULT_COLUMNS, DM], widths: {} });
});

afterEach(() => {
  localStorage.clear();
  useDm.getState().reset(null);
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

/** DM カラムを / に描き、/messages/:peer へ移れるルータ */
function renderDmColumn(spec: ColumnSpec) {
  const router = createMemoryRouter([
    { path: "/", element: <DeckColumn spec={spec} showHeader /> },
    { path: "/messages/:peer", element: <p>messages</p> },
  ]);
  render(<RouterProvider router={router} />);
  return router;
}

function seedDm() {
  useDm.getState().reset(PUBKEY);
  useDm.setState({ loaded: true });
  useDm.getState().upsertMessages([
    {
      owner: PUBKEY,
      id: "a1",
      peer: OTHER_PUBKEY,
      sender: OTHER_PUBKEY,
      content: "こんにちは",
      tags: [],
      createdAt: 1_700_000_000,
      proto: "nip17",
    },
  ]);
}

it("DM カラムは会話の一覧を出し、購読しない。表示したら復号を始め、行を押すと /messages/npub1…（#506）", async () => {
  const user = userEvent.setup();
  vi.mocked(useColumnFeed).mockClear();
  vi.mocked(startDecrypting).mockClear();
  seedDm();
  const router = renderDmColumn(DM);

  expect(screen.getByRole("heading", { name: "DM" })).toBeInTheDocument();
  expect(screen.getByText("NIP-17")).toBeInTheDocument();
  expect(screen.queryByText(/まだ使えません/)).not.toBeInTheDocument();
  expect(vi.mocked(useColumnFeed)).not.toHaveBeenCalled();
  expect(vi.mocked(startDecrypting)).toHaveBeenCalledTimes(1);
  // 復号の案内（showBanners）はカラムに出さない
  act(() => useDm.setState({ pending: 3 }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /こんにちは/ }));
  expect(router.state.location.pathname).toBe(`/messages/${npubEncode(OTHER_PUBKEY)}`);
  // 履歴に積む（戻るでデッキへ）
  expect(router.state.historyAction).toBe("PUSH");
});

it("同期で入ってきた DM カラム（ネイティブの JSON）も会話の一覧になる", () => {
  const [synced] =
    decodeDeckColumns(
      '[{"id":"col_dm_1700000000","title":"DM","subtitle":"NIP-17","kind":"DM","renderer":"FEED","filter":{"kinds":[14]}}]',
    ) ?? [];
  seedDm();
  renderDmColumn(synced);
  expect(screen.getByRole("heading", { name: "DM" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /こんにちは/ })).toBeInTheDocument();
});

it("⋯ の「ミュートを表示 / 隠す」でカラムの設定を切り替える。描けない種別には出さない（#465）", async () => {
  const user = userEvent.setup();
  const [, hashtag] = DEFAULT_COLUMNS;
  useDeck.setState({ revealMuted: [] });
  const { unmount } = render(<DeckColumn spec={hashtag} showHeader />);

  await user.click(screen.getByRole("button", { name: "カラムメニュー" }));
  await user.click(screen.getByRole("menuitem", { name: "ミュートを表示" }));
  expect(useDeck.getState().revealMuted).toEqual(["c_hashtag"]);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "カラムメニュー" }));
  await user.click(screen.getByRole("menuitem", { name: "ミュートを隠す" }));
  expect(useDeck.getState().revealMuted).toEqual([]);
  unmount();

  render(<DeckColumn spec={THREAD} showHeader />);
  await user.click(screen.getByRole("button", { name: "カラムメニュー" }));
  expect(screen.queryByRole("menuitem", { name: "ミュートを表示" })).not.toBeInTheDocument();
});

it("「カラムを削除」でカラムが消える", async () => {
  const user = userEvent.setup();
  renderWithRouter(<DeckColumn spec={DM} showHeader />);
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

it("通知カラムは種別（filter.kinds）に関わらずリアクション・Zap・リポストの行も出す（#460）", async () => {
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  const meKey = generateSecretKey();
  const me = getPublicKey(meKey);
  useSession.setState({ status: "in", method: "nip07", pubkey: me });
  const target = finalizeEvent(
    { kind: 1, created_at: unixNow() - 600, tags: [], content: "自分の投稿" },
    meKey,
  );
  eventStore.add(target);
  const tags = [
    ["e", target.id],
    ["p", me],
  ];
  const reaction = finalizeEvent(
    { kind: 7, created_at: unixNow() - 100, tags, content: "+" },
    generateSecretKey(),
  );
  const zap = finalizeEvent(
    {
      kind: 9735,
      created_at: unixNow() - 200,
      tags: [...tags, ["description", JSON.stringify({ kind: 9734, tags: [["amount", "21000"]] })]],
      content: "",
    },
    generateSecretKey(),
  );
  const repost = finalizeEvent(
    { kind: 6, created_at: unixNow() - 300, tags, content: "" },
    generateSecretKey(),
  );
  const [, , notif] = DEFAULT_COLUMNS;
  const original = vi.mocked(useColumnFeed).getMockImplementation();
  vi.mocked(useColumnFeed).mockImplementation(() => ({
    mode: "column",
    loading: false,
    events: [reaction, zap, repost],
    loadingOlder: false,
    loadOlder: () => {},
    refresh: () => {},
  }));
  try {
    renderWithRouter(
      <VirtuosoMockContext.Provider value={{ viewportHeight: 2000, itemHeight: 100 }}>
        <DeckColumn spec={{ ...notif, filter: { ...notif.filter, kinds: [1, 7, 9735] } }} showHeader />
      </VirtuosoMockContext.Provider>,
    );
    expect(await screen.findByRole("img", { name: "リアクション ❤️" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Zap" })).toBeInTheDocument();
    expect(screen.getByText("⚡ 21")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "リポスト" })).toBeInTheDocument();
  } finally {
    if (original) vi.mocked(useColumnFeed).mockImplementation(original);
    useSession.setState({ status: "loading", method: null, pubkey: null });
  }
});
