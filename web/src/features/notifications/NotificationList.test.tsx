import { screen } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { unixNow } from "../../lib/time";
import { useSession } from "../../signer/session";
import { renderWithRouter } from "../../test/renderWithRouter";
import { NotificationList } from "./NotificationList";

let meKey: Uint8Array;
let me: string;

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

beforeEach(() => {
  meKey = generateSecretKey();
  me = getPublicKey(meKey);
  useSession.setState({ status: "in", method: "nip07", pubkey: me });
});

afterEach(() => {
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

function renderList(events: NostrEvent[], loading = false) {
  return renderWithRouter(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 2000, itemHeight: 100 }}>
      <NotificationList events={events} loading={loading} />
    </VirtuosoMockContext.Provider>,
  );
}

function signed(kind: number, key: Uint8Array, tags: string[][], content: string, ago: number) {
  return finalizeEvent({ kind, created_at: unixNow() - ago, tags, content }, key);
}

it("0 件なら読み込み中は「読み込み中…」、それ以外は「通知はまだありません」", () => {
  const loading = renderList([], true);
  expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  loading.unmount();

  renderList([]);
  expect(screen.getByText("通知はまだありません")).toBeInTheDocument();
});

it("自分の投稿は行にせず、種別の混ざった通知を新しい順に 1 件 1 行で並べる", () => {
  const target = "f".repeat(64);
  const repost = signed(
    6,
    generateSecretKey(),
    [
      ["e", target],
      ["p", me],
    ],
    "",
    300,
  );
  const reaction = signed(
    7,
    generateSecretKey(),
    [
      ["e", target],
      ["p", me],
    ],
    "+",
    200,
  );
  const mention = signed(1, generateSecretKey(), [["p", me]], "メンションです", 100);
  const mine = signed(1, meKey, [["p", me]], "自分の投稿", 50);

  const { container } = renderList([repost, mine, reaction, mention]);

  const kinds = [...container.querySelectorAll("article[data-kind]")].map((row) =>
    row.getAttribute("data-kind"),
  );
  expect(kinds).toEqual(["mention", "reaction", "repost"]);
  expect(screen.queryByText("自分の投稿")).toBeNull();
});
