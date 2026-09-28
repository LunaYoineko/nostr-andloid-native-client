import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../../app/routes";
import type { ColumnSpec } from "../../lib/columns";
import { DEFAULT_COLUMNS } from "../../lib/columns";
import { useSession } from "../../signer/session";
import { useDeck } from "../../store/deck";
import { OTHER_PUBKEY, PUBKEY, resetSession } from "../../test/fakeNostr";
import { clearViewport, mockViewport } from "../../test/viewport";
import { useDmSeen } from "../dm/dmSeen";
import { useDm } from "../dm/dmStore";
import { resetChannelsForTest, useChannels } from "./channels";
import { dmUnreadNow, loadSegment, MESSAGES_SEGMENT_KEY, messagesPath } from "./segment";

// カラムの中身とダイアログは描かない（AppShell.test と同じ）
vi.mock("../deck/DeckColumn", () => ({
  DeckColumn: ({ spec }: { spec: ColumnSpec }) => <div data-testid={`col-${spec.id}`} />,
  ColumnMenu: () => <button type="button">カラムメニュー</button>,
}));
vi.mock("../deck/AddColumnDialog", () => ({ AddColumnDialog: () => <div role="dialog" /> }));
vi.mock("../deck/EditColumnDialog", () => ({ EditColumnDialog: () => <div role="dialog" /> }));
// DM の購読・復号はしない
vi.mock("../dm/dmService", () => ({ startDecrypting: vi.fn(), resumeDecrypting: vi.fn() }));

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
  useSession.setState({ status: "in", method: "nip07", pubkey: PUBKEY });
  // 一覧の取得は空を返す（実際には取りに行かない）
  useChannels.setState({ channels: [] });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ data: [] }))),
  );
  useDm.getState().reset(PUBKEY);
  useDmSeen.setState({ me: PUBKEY, first: 0, peers: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearViewport();
  resetSession();
  resetChannelsForTest();
  useDm.getState().reset(null);
  useDmSeen.setState({ me: null, first: 0, peers: {} });
});

function seedUnreadDm() {
  useDm.getState().upsertMessages([
    {
      owner: PUBKEY,
      id: "a1",
      peer: OTHER_PUBKEY,
      sender: OTHER_PUBKEY,
      content: "未読",
      tags: [],
      createdAt: 1,
      proto: "nip17",
    },
  ]);
}

function renderAt(path: string, width = 400) {
  mockViewport(width);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

function messagesButton() {
  return within(screen.getByRole("navigation", { name: "メイン" })).getByRole("button", {
    name: /^メッセージ/,
  });
}

describe("messagesPath（ネイティブ openMessages）", () => {
  it("未読の DM があれば DM、無ければ最後に使った側", () => {
    expect(messagesPath(2, "chat")).toBe("/messages");
    expect(messagesPath(0, "chat")).toBe("/channels");
    expect(messagesPath(0, "dm")).toBe("/messages");
  });

  it("最後に使った側は localStorage nostrism.messages.segment（無い・壊れていれば DM）", () => {
    expect(MESSAGES_SEGMENT_KEY).toBe("nostrism.messages.segment");
    expect(loadSegment()).toBe("dm");
    localStorage.setItem(MESSAGES_SEGMENT_KEY, "chat");
    expect(loadSegment()).toBe("chat");
    localStorage.setItem(MESSAGES_SEGMENT_KEY, "broken");
    expect(loadSegment()).toBe("dm");
  });

  it("dmUnreadNow はナビのバッジと同じ未読の合計", () => {
    expect(dmUnreadNow()).toBe(0);
    seedUnreadDm();
    expect(dmUnreadNow()).toBe(1);
  });
});

describe("下部ナビ・レールの「メッセージ」", () => {
  it("未読の DM が無ければ最後に使った側（チャット）へ置き換える", async () => {
    localStorage.setItem(MESSAGES_SEGMENT_KEY, "chat");
    const router = renderAt("/");
    await userEvent.click(messagesButton());
    expect(router.state.location.pathname).toBe("/channels");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.getByRole("tab", { name: "チャット" })).toHaveAttribute("aria-selected", "true");
    // チャットでもナビは「メッセージ」を選択表示する
    expect(messagesButton()).toHaveAttribute("aria-current", "page");
  });

  it("未読の DM があれば最後がチャットでも DM", async () => {
    localStorage.setItem(MESSAGES_SEGMENT_KEY, "chat");
    seedUnreadDm();
    const router = renderAt("/search", 1200);
    await userEvent.click(messagesButton());
    expect(router.state.location.pathname).toBe("/messages");
  });

  it("最後に使った側が無ければ DM", async () => {
    const router = renderAt("/");
    await userEvent.click(messagesButton());
    expect(router.state.location.pathname).toBe("/messages");
  });

  it("/channels の詳細（プロフィール）の背後もチャットのまま", async () => {
    const router = renderAt("/channels");
    expect(screen.getByRole("tab", { name: "チャット" })).toHaveAttribute("aria-selected", "true");
    await act(() => router.navigate(`/p/${OTHER_PUBKEY}`));
    expect(screen.getByRole("tab", { name: "チャット", hidden: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
