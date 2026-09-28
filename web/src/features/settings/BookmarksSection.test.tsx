import { screen } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { VirtuosoMockContext } from "react-virtuoso";
import { beforeAll, expect, it, vi } from "vitest";
import { unixNow } from "../../lib/time";
import { renderWithRouter } from "../../test/renderWithRouter";
import { useNotesByIds } from "../lists/notesByIds";
import { useBookmarkedIds } from "../lists/ownLists";
import { BookmarksSection } from "./BookmarksSection";

// id 一覧・中身の解決はテストごとに固定の配列を返す（購読は startOwnLists 側。ここではしない）
vi.mock("../lists/ownLists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lists/ownLists")>()),
  useBookmarkedIds: vi.fn(),
}));
vi.mock("../lists/notesByIds", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lists/notesByIds")>()),
  useNotesByIds: vi.fn(),
}));

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

function renderSection() {
  return renderWithRouter(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 2000, itemHeight: 100 }}>
      <BookmarksSection />
    </VirtuosoMockContext.Provider>,
  );
}

function note(content: string): NostrEvent {
  return finalizeEvent({ kind: 1, created_at: unixNow(), tags: [], content }, generateSecretKey());
}

it("id 一覧（追加の新しい順）に解決できた投稿を NoteItem で並べる", () => {
  const older = note("前に追加した投稿");
  const newer = note("さっき追加した投稿");
  // useBookmarkedIds は末尾が上（新しい順）で返す
  vi.mocked(useBookmarkedIds).mockReturnValue([newer.id, older.id]);
  vi.mocked(useNotesByIds).mockReturnValue([newer, older]);

  renderSection();
  expect(vi.mocked(useNotesByIds)).toHaveBeenCalledWith([newer.id, older.id]);
  const lines = screen.getAllByText(/(さっき|前に)追加した投稿$/).map((el) => el.textContent);
  expect(lines[0]).toMatch(/さっき追加した投稿$/);
  expect(lines[1]).toMatch(/前に追加した投稿$/);
});

it("id が無ければ「ブックマークはまだありません。」とヒント", () => {
  vi.mocked(useBookmarkedIds).mockReturnValue([]);
  vi.mocked(useNotesByIds).mockReturnValue([]);
  renderSection();
  expect(screen.getByText("ブックマークはまだありません。")).toBeInTheDocument();
  expect(screen.getByText("各投稿の ⋯ メニュー →「ブックマーク」で追加できます。")).toBeInTheDocument();
});

it("id はあるがまだ 1 件も解決できていなければ件数つきで取得中", () => {
  vi.mocked(useBookmarkedIds).mockReturnValue(["a", "b", "c"]);
  vi.mocked(useNotesByIds).mockReturnValue([]);
  renderSection();
  expect(screen.getByText("リレーから取得中…（3件）")).toBeInTheDocument();
  expect(screen.queryByText("ブックマークはまだありません。")).toBeNull();
});
