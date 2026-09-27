import { act, fireEvent, screen } from "@testing-library/react";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { VirtuosoMockContext } from "react-virtuoso";
import { beforeAll, expect, it } from "vitest";
import { unixNow } from "../../lib/time";
import { renderWithRouter } from "../../test/renderWithRouter";
import { Timeline } from "./Timeline";

const KEY = generateSecretKey();
const NOW = unixNow();
// 新しい順に 20 件（描画のたびに同じ配列を渡す）
const EVENTS = Array.from({ length: 20 }, (_, i) =>
  finalizeEvent({ kind: 1, created_at: NOW - i * 60, tags: [], content: `投稿 ${i}` }, KEY),
);

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

function renderTimeline() {
  const view = renderWithRouter(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 300, itemHeight: 100 }}>
      <Timeline events={EVENTS} loading={false} />
    </VirtuosoMockContext.Provider>,
  );
  const found = view.container.querySelector<HTMLElement>('[data-testid="virtuoso-scroller"]');
  if (!found) throw new Error("scroller が無い");
  const scroller: HTMLElement = found;
  function scrollTo(top: number) {
    act(() => {
      scroller.scrollTop = top;
      fireEvent.scroll(scroller);
    });
  }
  return { scrollTo };
}

it("先頭では何も出さず、3 件目以降まで下りると「最新へ戻る」を出す（ネイティブの FeedTopPill）", () => {
  const { scrollTo } = renderTimeline();
  expect(screen.queryByRole("button", { name: /最新へ戻る/ })).toBeNull();

  // 2 件目（位置 1）ではまだ出さない
  scrollTo(150);
  expect(screen.queryByRole("button", { name: /最新へ戻る/ })).toBeNull();

  scrollTo(500);
  expect(screen.getByRole("button", { name: "↑ 最新へ戻る" })).toBeInTheDocument();

  scrollTo(0);
  expect(screen.queryByRole("button", { name: /最新へ戻る/ })).toBeNull();
});
