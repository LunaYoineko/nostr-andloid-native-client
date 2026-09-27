import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import type { ReactElement } from "react";
import { useLocation } from "react-router";
import { VirtuosoMockContext } from "react-virtuoso";
import type { Subject } from "rxjs";
import { beforeEach, expect, it, vi } from "vitest";
import { formatAbsoluteTime } from "../../lib/time";
import { subscribeTo } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { renderWithRouter } from "../../test/renderWithRouter";
import cardStyles from "./CommentRootCard.module.css";
import reactorStyles from "./ReactorRow.module.css";
import { ThreadScreen } from "./ThreadScreen";

// リレーには繋がず、REQ ごとに Subject を返す（EOSE はテストから流す）
vi.mock("../../nostr/pool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../nostr/pool")>();
  const { Subject } = await import("rxjs");
  const relays = ["wss://relay.example"];
  return {
    ...actual,
    useReadRelays: () => relays,
    subscribeTo: vi.fn(() => new Subject<"EOSE">()),
    requestOnce: vi.fn(() => new Subject<NostrEvent>()),
  };
});

beforeEach(() => {
  vi.mocked(subscribeTo).mockClear();
});

/** 今の URL のパス（クリックで移動したかを見る） */
function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

/** jsdom は高さを測れないので、仮想リストに行の高さを与えて描く */
function render(ui: ReactElement) {
  return renderWithRouter(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 2000, itemHeight: 100 }}>
      {ui}
      <Where />
    </VirtuosoMockContext.Provider>,
  );
}

function signed(
  kind: number,
  tags: string[][] = [],
  { key = generateSecretKey(), content = "", createdAt = 1_000 } = {},
): NostrEvent {
  return finalizeEvent({ kind, created_at: createdAt, tags, content }, key);
}

function stored(...args: Parameters<typeof signed>): NostrEvent {
  const event = signed(...args);
  eventStore.add(event);
  return event;
}

/** root R ← 起点 F ← 返信 Y の 3 件 */
function conversation(focusTags: string[][] = []) {
  const root = stored(1, [], { content: "ルートの投稿", createdAt: 1_000 });
  const focus = stored(1, [["e", root.id, "", "root"], ...focusTags], {
    content: "起点の投稿",
    createdAt: 1_001,
  });
  const reply = stored(
    1,
    [
      ["e", root.id, "", "root"],
      ["e", focus.id, "", "reply"],
    ],
    { content: "返信の投稿", createdAt: 1_002 },
  );
  return { root, focus, reply };
}

/** ReactorRow の行（DOM の順） */
function reactorRows(container: HTMLElement): HTMLElement[] {
  return [...container.getElementsByClassName(reactorStyles.row)] as HTMLElement[];
}

it("root から段を付けて並べ、起点の下に日時と反応を出す", () => {
  const { root, focus, reply } = conversation([["client", "Nostrism"]]);
  for (let i = 0; i < 2; i++) stored(7, [["e", focus.id]], { content: "+" });
  stored(6, [["e", focus.id]]);

  const { container } = render(<ThreadScreen pointer={{ id: focus.id }} />);

  const articles = container.querySelectorAll("article");
  expect(articles).toHaveLength(3);
  const rowOf = (text: string) => screen.getByText(text).closest("[data-focused]") as HTMLElement;
  expect(rowOf("ルートの投稿")).toHaveAttribute("data-root", "true");
  expect(rowOf("起点の投稿")).toHaveAttribute("data-focused", "true");
  expect(rowOf("返信の投稿")).toHaveAttribute("data-focused", "false");
  expect(rowOf("返信の投稿").style.getPropertyValue("--depth")).toBe("2");
  expect(articles[0]).toHaveTextContent(root.content);
  expect(articles[2]).toHaveTextContent(reply.content);

  const focusRow = rowOf("起点の投稿");
  expect(
    within(focusRow).getByText(`${formatAbsoluteTime(focus.created_at)} · via Nostrism`),
  ).toBeInTheDocument();
  expect(within(focusRow).getByText("リプライ 1 · リポスト 1 · リアクション 2")).toBeInTheDocument();

  const [repostRow, heartRow] = reactorRows(container);
  // 件数はラベルで見る（画像の無いアバターは pubkey の頭文字を出すので、数字の 1 文字と重なりうる）
  const countOf = (row: HTMLElement) => row.getElementsByClassName(reactorStyles.label)[0];
  expect(countOf(repostRow)).toHaveTextContent(/^1$/);
  expect(within(repostRow).getAllByRole("link")).toHaveLength(1);
  expect(within(heartRow).getByText("❤️")).toBeInTheDocument();
  expect(countOf(heartRow)).toHaveTextContent(/^2$/);
  expect(within(heartRow).getAllByRole("link")).toHaveLength(2);
  for (const link of within(heartRow).getAllByRole("link")) {
    expect(link.getAttribute("href")).toMatch(/^\/p\/npub1/);
  }
});

it("client タグが無ければ日時だけ", () => {
  const { focus } = conversation();

  render(<ThreadScreen pointer={{ id: focus.id }} />);

  expect(screen.getByText(formatAbsoluteTime(focus.created_at))).toBeInTheDocument();
});

it("反応が 0 件なら集計の行を出さない", () => {
  const root = stored(1, [], { content: "ルートの投稿" });
  const focus = stored(1, [["e", root.id, "", "root"]], { content: "起点の投稿", createdAt: 1_001 });

  const { container } = render(<ThreadScreen pointer={{ id: focus.id }} />);

  expect(screen.getByText("起点の投稿")).toBeInTheDocument();
  expect(screen.queryByText(/リプライ/)).toBeNull();
  expect(reactorRows(container)).toHaveLength(0);
});

it("リアクションした人が 13 人ならアバターは 12 個と +1", () => {
  const { focus } = conversation();
  for (let i = 0; i < 13; i++) stored(7, [["e", focus.id]], { content: "🔥" });

  const { container } = render(<ThreadScreen pointer={{ id: focus.id }} />);

  const [fireRow] = reactorRows(container);
  expect(within(fireRow).getByText("🔥")).toBeInTheDocument();
  expect(within(fireRow).getByText("13")).toBeInTheDocument();
  expect(within(fireRow).getAllByRole("link")).toHaveLength(12);
  expect(within(fireRow).getByText("+1")).toBeInTheDocument();
});

it("onReply を渡すと返信ボックスが出て、押すと起点で呼ぶ", async () => {
  const { focus } = conversation();
  const onReply = vi.fn();

  render(<ThreadScreen pointer={{ id: focus.id }} onReply={onReply} />);
  await userEvent.click(screen.getByRole("button", { name: "返信を書く" }));

  expect(onReply).toHaveBeenCalledWith(focus);
});

it("onReply が無ければ返信ボックスを出さない", () => {
  const { focus } = conversation();

  render(<ThreadScreen pointer={{ id: focus.id }} />);

  expect(screen.queryByRole("button", { name: "返信を書く" })).toBeNull();
});

it("行の本文を押してもスレッドを開き直さない", async () => {
  const { focus } = conversation();
  render(<ThreadScreen pointer={{ id: focus.id }} />);
  const before = screen.getByTestId("where").textContent;

  await userEvent.click(screen.getByText("返信の投稿"));

  expect(screen.getByTestId("where").textContent).toBe(before);
  // 時刻もリンクにしない
  for (const time of document.querySelectorAll("article time")) expect(time.closest("a")).toBeNull();
});

it("行が 0 件なら読み込み中、EOSE の後は見つかりませんでした", () => {
  const missing = signed(1).id;

  render(<ThreadScreen pointer={{ id: missing }} />);
  expect(screen.getByText("読み込み中…")).toBeInTheDocument();

  const reply = vi.mocked(subscribeTo).mock.results[0].value as Subject<"EOSE">;
  act(() => reply.next("EOSE"));

  expect(screen.getByText("見つかりませんでした")).toBeInTheDocument();
});

it("NIP-22 コメント（I タグ）は先頭に外部リンクのカードを出す", () => {
  const comment = stored(1111, [
    ["I", "https://example.com/a"],
    ["K", "web"],
  ]);

  render(<ThreadScreen pointer={{ id: comment.id }} />);

  const card = screen.getByRole("link", { name: /example\.com へのコメント/ });
  expect(card).toHaveAttribute("href", "https://example.com/a");
  expect(card).toHaveAttribute("target", "_blank");
});

it("NIP-22 コメントのルート（E）が未取得なら K タグから「kind N へのコメント」", () => {
  const comment = stored(1111, [
    ["E", signed(1).id],
    ["K", "30023"],
  ]);

  const { container } = render(<ThreadScreen pointer={{ id: comment.id }} />);

  const [wrap] = container.getElementsByClassName(cardStyles.wrap);
  expect(wrap).toHaveTextContent("kind 30023 へのコメント");
});

it("kind:1 / 1111 以外の起点は「Web 版ではまだ表示できません」", () => {
  const article = stored(30023, [["d", "x"]], { content: "# 記事" });

  render(<ThreadScreen pointer={{ id: article.id }} />);

  expect(screen.getByText("kind 30023 の投稿は Web 版ではまだ表示できません")).toBeInTheDocument();
});
