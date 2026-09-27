import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { decode, npubEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { clearViewport, mockViewport } from "../../test/viewport";
import { FollowError, toggleFollow } from "./follow";
import { ProfileScreen } from "./ProfileScreen";
import { useContactsOf } from "./useContactsOf";
import { useProfileFeed } from "./useProfileFeed";

// 自分の kind:3 の購読（useFollows）はリレーに繋がない。それ以外はテスト用のオフライン WebSocket のまま
vi.mock("../../nostr/pool", async (importOriginal) => {
  const { Subject } = await import("rxjs");
  return {
    ...(await importOriginal<typeof import("../../nostr/pool")>()),
    subscribe: vi.fn(() => new Subject<"EOSE">()),
  };
});

vi.mock("./useProfileFeed", () => ({
  useProfileFeed: vi.fn(() => ({ loading: false, posts: [], media: [] })),
}));

vi.mock("./useContactsOf", () => ({ useContactsOf: vi.fn(() => null) }));

vi.mock("./follow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./follow")>()),
  toggleFollow: vi.fn(async () => "done"),
}));

const BANNER = "https://img.test/banner.jpg";
const PICTURE = "https://img.test/alice.png";

let themKey: Uint8Array;
let them: string;
let meKey: Uint8Array;
let me: string;
let writeText: ReturnType<typeof vi.fn>;

beforeAll(() => {
  // jsdom に ResizeObserver が無い（Virtuoso が使う。寸法は VirtuosoMockContext が与える）
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // jsdom の版によっては showModal が無い
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
  }
});

beforeEach(() => {
  themKey = generateSecretKey();
  them = getPublicKey(themKey);
  meKey = generateSecretKey();
  me = getPublicKey(meKey);
  useSession.setState({ status: "in", method: "nip07", pubkey: me });
  // NIP-05 の検証は外へ出さない（確認中のまま）
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  mockClipboard();
  vi.mocked(toggleFollow).mockReset();
  vi.mocked(toggleFollow).mockResolvedValue("done");
  vi.mocked(useContactsOf).mockReturnValue(null);
  vi.mocked(useProfileFeed).mockReturnValue({ loading: false, posts: [], media: [] });
  mockViewport(400);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearViewport();
  Reflect.deleteProperty(navigator, "clipboard");
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

/** navigator.clipboard を差し替える（userEvent.setup() は自前の clipboard を入れるので、その後にも呼ぶ） */
function mockClipboard() {
  writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
}

function addProfile(key: Uint8Array, content: Record<string, unknown>, tags: string[][] = []) {
  eventStore.add(finalizeEvent({ kind: 0, created_at: 1_000, tags, content: JSON.stringify(content) }, key));
}

function addRelayList(key: Uint8Array, tags: string[][]) {
  eventStore.add(finalizeEvent({ kind: 10002, created_at: 1_000, tags, content: "" }, key));
}

function addContacts(key: Uint8Array, follows: string[]) {
  eventStore.add(
    finalizeEvent({ kind: 3, created_at: 1_000, tags: follows.map((p) => ["p", p]), content: "" }, key),
  );
}

function note(
  key: Uint8Array,
  content: string,
  createdAt: number,
  kind = 1,
  tags: string[][] = [],
): NostrEvent {
  return finalizeEvent({ kind, created_at: createdAt, tags, content }, key);
}

/** プロフィール画面をメモリ上のルータで描く（Virtuoso は全行を描くモック） */
function renderScreen(pubkey = them, relayHints: string[] = []) {
  const ui: ReactElement = (
    <VirtuosoMockContext.Provider value={{ viewportHeight: 2000, itemHeight: 100 }}>
      <ProfileScreen pubkey={pubkey} relayHints={relayHints} onBack={() => {}} />
    </VirtuosoMockContext.Provider>
  );
  const router = createMemoryRouter([{ path: "*", element: ui }], { initialEntries: ["/p/x"] });
  const { unmount } = render(<RouterProvider router={router} />);
  return { router, unmount };
}

function alice(extra: Record<string, unknown> = {}) {
  addProfile(themKey, { name: "Alice", picture: PICTURE, banner: BANNER, ...extra });
}

describe("レイアウト", () => {
  it("compact: 上バーの見出しが表示名、タブは 1 つ、左ペインは無い", () => {
    alice();
    renderScreen();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Alice");
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("expanded: 左ペインに「プロフィール」とヘッダカード、タブと投稿はその外", () => {
    mockViewport(1200);
    alice();
    renderScreen();
    const side = screen.getByRole("complementary", { name: "プロフィール詳細" });
    expect(within(side).getByRole("heading", { level: 1, name: "プロフィール" })).toBeInTheDocument();
    expect(within(side).getByRole("heading", { level: 2, name: "Alice" })).toBeInTheDocument();
    expect(within(side).queryByRole("tablist")).not.toBeInTheDocument();
    expect(within(side).queryByRole("tabpanel")).not.toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });
});

describe("ヘッダカード", () => {
  it("バナーは幅 900・品質 80、アバターは幅 256 のプロキシ。バナーを押すと原 URL で開く", async () => {
    const user = userEvent.setup();
    alice();
    renderScreen();

    const container = document.body;
    const banner = container.querySelector<HTMLImageElement>(`img[src*="${encodeURIComponent(BANNER)}"]`);
    expect(banner?.src).toContain("w=900");
    expect(banner?.src).toContain("q=80");
    const avatar = container.querySelector<HTMLImageElement>(`img[src*="${encodeURIComponent(PICTURE)}"]`);
    expect(avatar?.src).toContain("w=256");

    const [bannerButton] = screen.getAllByRole("button", { name: "画像を表示" });
    await user.click(bannerButton);
    const dialog = screen.getByRole("dialog", { name: "画像" });
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe(BANNER);
  });

  it("名前は h2、NIP-05 の文字、npub は先頭 20 + … + 末尾 6。コピーすると 1.5 秒だけ知らせる", async () => {
    vi.useFakeTimers();
    alice({ nip05: "alice@example.com" });
    renderScreen();

    expect(screen.getByRole("heading", { level: 2, name: "Alice" })).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    const npub = npubEncode(them);
    expect(screen.getByText(`${npub.slice(0, 20)}…${npub.slice(-6)}`)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "npub をコピー" }));
    });
    expect(writeText).toHaveBeenCalledWith(npub);
    expect(screen.getByRole("status")).toHaveTextContent("npub をコピーしました");

    act(() => vi.advanceTimersByTime(1_499));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("⋯ メニュー: nprofile（リレーは kind:10002 の先頭 3 件）と njump のリンクをコピーする", async () => {
    const user = userEvent.setup();
    mockClipboard();
    alice();
    addRelayList(themKey, [
      ["r", "wss://relay.one"],
      ["r", "wss://relay.two/", "read"],
      ["r", "wss://relay.three", "write"],
      ["r", "wss://relay.four"],
    ]);
    renderScreen();

    await user.click(screen.getByRole("button", { name: "メニュー" }));
    await user.click(screen.getByRole("menuitem", { name: "nprofile をコピー" }));
    const nprofile = writeText.mock.calls[0][0] as string;
    const decoded = decode(nprofile);
    expect(decoded.type).toBe("nprofile");
    expect(decoded.data).toEqual({
      pubkey: them,
      relays: ["wss://relay.one", "wss://relay.two", "wss://relay.three"],
    });
    expect(screen.getByRole("status")).toHaveTextContent("nprofile をコピーしました");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "メニュー" }));
    await user.click(screen.getByRole("menuitem", { name: "リンクをコピー（njump）" }));
    expect(writeText).toHaveBeenLastCalledWith(`https://njump.me/${nprofile}`);
    expect(screen.getByRole("status")).toHaveTextContent("リンクをコピーしました");
  });

  it("自己紹介の URL・#タグ・メンションはリンク（画像 URL もリンクのまま）、lud16 と website", () => {
    const mentioned = npubEncode(getPublicKey(generateSecretKey()));
    alice({
      about: `見て https://x.co と #nostr と nostr:${mentioned} https://i.test/1.jpg`,
      lud16: "alice@getalby.com",
      website: "https://alice.example",
    });
    renderScreen();

    for (const href of ["https://x.co", "https://i.test/1.jpg"]) {
      const link = screen.getByRole("link", { name: href });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
    }
    expect(screen.getByRole("link", { name: "#nostr" })).toHaveAttribute("href", "/t/nostr");
    const mention = screen.getAllByRole("link").find((a) => a.getAttribute("href") === `/p/${mentioned}`);
    expect(mention).toBeDefined();
    expect(screen.getByText("⚡ alice@getalby.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://alice.example" })).toHaveAttribute(
      "href",
      "https://alice.example",
    );
  });

  it("スキームの無い website は文字のまま", () => {
    alice({ website: "alice.example" });
    renderScreen();
    expect(screen.getByText("alice.example")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "alice.example" })).not.toBeInTheDocument();
  });

  it("使用リレー: 押すと URL（wss:// と末尾 / 無し）と read / write。kind:10002 が無ければ出さない", async () => {
    const user = userEvent.setup();
    alice();
    addRelayList(themKey, [
      ["r", "wss://relay.one"],
      ["r", "wss://relay.two/", "read"],
    ]);
    renderScreen();

    const toggle = screen.getByRole("button", { name: /使用リレー \(2\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("relay.one");
    expect(rows[0]).toHaveTextContent("read · write");
    expect(rows[1]).toHaveTextContent("relay.two");
    expect(rows[1]).not.toHaveTextContent("write");
  });

  it("kind:10002 が無ければ使用リレーの項目自体が無い", () => {
    alice();
    renderScreen();
    expect(screen.queryByRole("button", { name: /使用リレー/ })).not.toBeInTheDocument();
  });
});

describe("フォロー", () => {
  it("未フォローは「フォロー」。押すと follow し、終わるまで押せない", async () => {
    const user = userEvent.setup();
    let finish: (value: "done") => void = () => {};
    vi.mocked(toggleFollow).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    alice();
    renderScreen();

    const button = screen.getByRole("button", { name: "フォロー" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await user.click(button);
    expect(vi.mocked(toggleFollow)).toHaveBeenCalledWith(me, them, "follow");
    expect(button).toBeDisabled();

    await act(async () => finish("done"));
    expect(button).toBeEnabled();
  });

  it("自分の kind:3 に相手がいれば「フォロー中」。押すと unfollow", async () => {
    const user = userEvent.setup();
    alice();
    addContacts(meKey, [them]);
    renderScreen();

    const button = screen.getByRole("button", { name: "フォロー中" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await user.click(button);
    expect(vi.mocked(toggleFollow)).toHaveBeenCalledWith(me, them, "unfollow");
  });

  it("自分のフォローリストが取れなければその旨、その他の失敗は「更新できませんでした」", async () => {
    const user = userEvent.setup();
    alice();
    renderScreen();

    vi.mocked(toggleFollow).mockRejectedValueOnce(new FollowError("no-contacts"));
    await user.click(screen.getByRole("button", { name: "フォロー" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "フォローリストを取得できませんでした。通信状態を確認してもう一度お試しください",
    );

    vi.mocked(toggleFollow).mockRejectedValueOnce(new FollowError("not-accepted"));
    await user.click(screen.getByRole("button", { name: "フォロー" }));
    expect(screen.getByRole("alert")).toHaveTextContent("フォローを更新できませんでした");
  });

  it("相手のフォローに自分がいれば「フォローされています」。件数を押すと一覧、「戻る」でプロフィール", async () => {
    const user = userEvent.setup();
    alice();
    const other = getPublicKey(generateSecretKey());
    vi.mocked(useContactsOf).mockReturnValue([me, other]);
    renderScreen();

    expect(screen.getByText("フォローされています")).toBeInTheDocument();
    const count = screen.getByRole("button", { name: /フォロー中/ });
    expect(count).toHaveTextContent("2");
    await user.click(count);

    expect(screen.getByRole("heading", { name: "フォロー中" })).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      `/p/${npubEncode(me)}`,
      `/p/${npubEncode(other)}`,
    ]);

    await user.click(screen.getByRole("button", { name: "戻る" }));
    expect(screen.getByRole("heading", { level: 2, name: "Alice" })).toBeInTheDocument();
  });

  it("自分のプロフィール: 「編集」があり「フォロー」は無い。押すと設定へ", async () => {
    const user = userEvent.setup();
    addProfile(meKey, { name: "Me" });
    const { router } = renderScreen(me);

    expect(screen.queryByRole("button", { name: "フォロー" })).not.toBeInTheDocument();
    expect(vi.mocked(useContactsOf)).toHaveBeenCalledWith(null);
    await user.click(screen.getByRole("button", { name: "編集" }));
    expect(router.state.location.pathname).toBe("/settings/account");
  });
});

describe("タブ", () => {
  it("投稿は kind 1 と リポスト、メディアは画像のある投稿だけ", async () => {
    const user = userEvent.setup();
    alice();
    const otherKey = generateSecretKey();
    const original = note(otherKey, "元の投稿です", 900);
    eventStore.add(original);
    addProfile(otherKey, { name: "Bob" });
    const text = note(themKey, "ふつうの投稿", 1_000);
    const repost = note(themKey, "", 1_001, 6, [["e", original.id]]);
    const photo = note(themKey, "写真 https://img.test/p.jpg", 1_002);
    vi.mocked(useProfileFeed).mockReturnValue({
      loading: false,
      posts: [photo, repost, text],
      media: [photo],
    });
    renderScreen();

    const posts = screen.getByRole("tab", { name: "投稿" });
    expect(posts).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getAllByRole("article")).toHaveLength(3);
    expect(within(panel).getByText("ふつうの投稿")).toBeInTheDocument();
    expect(within(panel).getByText("元の投稿です")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "メディア" }));
    expect(screen.getByRole("tab", { name: "メディア" })).toHaveAttribute("aria-selected", "true");
    const media = within(screen.getByRole("tabpanel")).getAllByRole("article");
    expect(media).toHaveLength(1);
    expect(media[0]).toHaveTextContent("写真");
  });

  it("空なら「まだ投稿がありません」、読み込み中は「読み込み中…」", () => {
    alice();
    vi.mocked(useProfileFeed).mockReturnValue({ loading: true, posts: [], media: [] });
    const { unmount } = renderScreen();
    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
    unmount();

    vi.mocked(useProfileFeed).mockReturnValue({ loading: false, posts: [], media: [] });
    renderScreen();
    expect(screen.getByText("まだ投稿がありません")).toBeInTheDocument();
  });
});
