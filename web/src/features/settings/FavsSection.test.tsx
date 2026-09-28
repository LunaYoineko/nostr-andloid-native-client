import { screen } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { VirtuosoMockContext } from "react-virtuoso";
import { beforeAll, expect, it, vi } from "vitest";
import { unixNow } from "../../lib/time";
import { eventStore } from "../../nostr/store";
import { renderWithRouter } from "../../test/renderWithRouter";
import { type ColumnFeed, useColumnFeed } from "../deck/useColumnFeed";
import { FavsSection } from "./FavsSection";

// 購読はしない（一覧はテストごとに固定の配列を返す）
vi.mock("../deck/useColumnFeed", () => ({ useColumnFeed: vi.fn() }));

const NO_EVENTS: NostrEvent[] = [];

function feed(events: NostrEvent[], loading = false): ColumnFeed {
  return {
    mode: "column",
    loading,
    events,
    rows: null,
    loadingOlder: false,
    loadOlder: () => {},
    refresh: () => {},
  };
}

beforeAll(() => {
  // jsdom に ResizeObserver が無い（Virtuoso が使う。寸法は VirtuosoMockContext が与える）
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function renderFavs() {
  return renderWithRouter(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 2000, itemHeight: 100 }}>
      <FavsSection />
    </VirtuosoMockContext.Provider>,
  );
}

it("自分のリアクションをふぁぼ欄と同じ行（あなたがリアクション + 対象の 1 行）で新しい順に並べる", async () => {
  const older = finalizeEvent(
    { kind: 1, created_at: unixNow() - 100, tags: [], content: "前にふぁぼった投稿" },
    generateSecretKey(),
  );
  const newer = finalizeEvent(
    { kind: 1, created_at: unixNow(), tags: [], content: "さっきふぁぼった投稿" },
    generateSecretKey(),
  );
  eventStore.add(older);
  eventStore.add(newer);
  const me = generateSecretKey();
  const reactionTo = (target: NostrEvent, at: number) =>
    finalizeEvent(
      {
        kind: 7,
        created_at: at,
        tags: [
          ["e", target.id],
          ["p", target.pubkey],
        ],
        content: "+",
      },
      me,
    );
  // useColumnFeed の events は新しい順
  const events = [reactionTo(newer, unixNow()), reactionTo(older, unixNow() - 50)];
  const result = feed(events);
  vi.mocked(useColumnFeed).mockReturnValue(result);

  renderFavs();
  expect(await screen.findAllByText("あなたがリアクション")).toHaveLength(2);
  const lines = screen.getAllByText(/: (さっき|前に)ふぁぼった投稿$/).map((el) => el.textContent);
  expect(lines[0]).toMatch(/さっきふぁぼった投稿$/);
  expect(lines[1]).toMatch(/前にふぁぼった投稿$/);
  // 投稿全体（アクション行）は出さない
  expect(screen.queryByRole("button", { name: "返信" })).toBeNull();
});

it("無ければ「ふぁぼした投稿はまだありません。」とヒント", () => {
  const result = feed(NO_EVENTS);
  vi.mocked(useColumnFeed).mockReturnValue(result);
  renderFavs();
  expect(screen.getByText("ふぁぼした投稿はまだありません。")).toBeInTheDocument();
  expect(screen.getByText("各投稿の ♡ でふぁぼできます。")).toBeInTheDocument();
});

it("読み込み中で空なら「読み込み中…」", () => {
  const result = feed(NO_EVENTS, true);
  vi.mocked(useColumnFeed).mockReturnValue(result);
  renderFavs();
  expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  expect(screen.queryByText("ふぁぼした投稿はまだありません。")).toBeNull();
});
