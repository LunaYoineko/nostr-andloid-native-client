import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { npubEncode } from "nostr-tools/nip19";
import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DmMessageRow } from "../../db/schema";
import { OTHER_PUBKEY, PUBKEY } from "../../test/fakeNostr";
import { clearViewport, mockViewport } from "../../test/viewport";
import { resumeDecrypting, startDecrypting } from "./dmService";
import { useDm } from "./dmStore";
import { MessagesScreen } from "./MessagesScreen";

// 購読・復号はしない（状態はストアへ直接入れる）
vi.mock("./dmService", () => ({ startDecrypting: vi.fn(), resumeDecrypting: vi.fn() }));

const ME = PUBKEY;
const ALICE = OTHER_PUBKEY;
const BOB = "a".repeat(64);

beforeEach(() => {
  vi.mocked(startDecrypting).mockClear();
  vi.mocked(resumeDecrypting).mockClear();
  useDm.getState().reset(ME);
  useDm.setState({ loaded: true });
});

afterEach(() => {
  clearViewport();
  useDm.getState().reset(null);
});

function dm(id: string, peer: string, sender: string, content: string, createdAt: number): DmMessageRow {
  return { owner: ME, id, peer, sender, content, tags: [], createdAt, proto: "nip17" };
}

function seed() {
  useDm
    .getState()
    .upsertMessages([
      dm("a1", ALICE, ALICE, "こんにちは", 1_700_000_000),
      dm("a2", ALICE, ME, "やあ", 1_700_000_100),
      dm("a3", ALICE, ALICE, "元気？", 1_700_000_200),
      dm("b1", BOB, BOB, "bob です", 1_700_000_050),
    ]);
}

function renderAt(path: string, width: number) {
  mockViewport(width);
  const router = createMemoryRouter(
    [
      { path: "/messages/:peer?", element: <MessagesScreen /> },
      { path: "/p/:ref", element: <p>profile</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

function rowButtons() {
  return within(screen.getByRole("list")).getAllByRole("button");
}

describe("一覧", () => {
  it("相手と最後のメッセージを新しい順に出し、表示したら復号を始める", () => {
    seed();
    renderAt("/messages", 400);
    expect(screen.getByRole("heading", { level: 1, name: "メッセージ" })).toBeInTheDocument();
    const rows = rowButtons();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(ALICE.slice(0, 10));
    expect(rows[0]).toHaveTextContent("元気？");
    expect(rows[1]).toHaveTextContent("bob です");
    expect(vi.mocked(startDecrypting)).toHaveBeenCalledTimes(1);
  });

  it("0 件: 読み込み前は進捗、読み込み後は「まだ会話がありません」", () => {
    useDm.setState({ loaded: false });
    renderAt("/messages", 400);
    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
    act(() => useDm.setState({ loaded: true }));
    expect(screen.getByText("まだ会話がありません")).toBeInTheDocument();
  });

  it("案内: NIP-44 が無い・復号中・一時停止（「再開」で resumeDecrypting）", async () => {
    useDm.setState({ nip17: "no-nip44", pending: 3 });
    renderAt("/messages", 400);
    const statuses = () => screen.getAllByRole("status").map((s) => s.textContent);
    expect(statuses()).toEqual([
      "この拡張機能は NIP-44 に対応していないため、NIP-17 の DM を読めません（NIP-04 の DM だけ表示しています）",
      "復号中（残り 3 件）",
    ]);

    act(() => useDm.setState({ nip17: "ok", paused: true }));
    expect(statuses()).toEqual(["復号を一時停止しました（署名の要求が拒否されたか、応答がありません）再開"]);
    await userEvent.click(screen.getByRole("button", { name: "再開" }));
    expect(vi.mocked(resumeDecrypting)).toHaveBeenCalledTimes(1);
  });

  it("アバターを押すと相手のプロフィール（/p/npub1…）", async () => {
    seed();
    const router = renderAt("/messages", 400);
    await userEvent.click(screen.getAllByRole("link", { name: /のプロフィール$/ })[0]);
    expect(router.state.location.pathname).toBe(`/p/${npubEncode(ALICE)}`);
  });
});

describe("Compact", () => {
  it("行を押すと /messages/npub1… で会話を開き、「戻る」で一覧へ", async () => {
    seed();
    const router = renderAt("/messages", 400);
    await userEvent.click(rowButtons()[0]);
    expect(router.state.location.pathname).toBe(`/messages/${npubEncode(ALICE)}`);

    const conversation = screen.getByRole("region");
    expect(within(conversation).getByRole("heading", { name: ALICE.slice(0, 10) })).toBeInTheDocument();
    expect(within(conversation).getByText("こんにちは")).toBeInTheDocument();
    expect(within(conversation).getByText("やあ")).toBeInTheDocument();
    expect(within(conversation).queryByText("bob です")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "戻る" }));
    expect(router.state.location.pathname).toBe("/messages");
    expect(rowButtons()).toHaveLength(2);
  });

  it("直接開いた会話の「戻る」は一覧へ置き換える", async () => {
    seed();
    const router = renderAt(`/messages/${npubEncode(ALICE)}`, 400);
    await userEvent.click(screen.getByRole("button", { name: "戻る" }));
    expect(router.state.location.pathname).toBe("/messages");
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("最新が下（DOM は新しい順）。自分の吹き出しと相手の吹き出しを分ける", () => {
    seed();
    renderAt(`/messages/${ALICE}`, 400);
    const texts = screen.getAllByText(/^(こんにちは|やあ|元気？)$/).map((e) => e.textContent);
    expect(texts).toEqual(["元気？", "やあ", "こんにちは"]);
  });

  it("相手を読めなければ「相手を読み取れません」", () => {
    renderAt("/messages/npub1broken", 400);
    expect(screen.getByText("相手を読み取れません")).toBeInTheDocument();
  });

  it("200 件より古いものは「さらに表示」で出す", async () => {
    useDm
      .getState()
      .upsertMessages(
        Array.from({ length: 201 }, (_, n) =>
          dm(`m${String(n).padStart(3, "0")}`, ALICE, ALICE, `msg ${n}`, n),
        ),
      );
    renderAt(`/messages/${npubEncode(ALICE)}`, 400);
    expect(screen.queryByText("msg 0")).not.toBeInTheDocument();
    expect(screen.getByText("msg 1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "さらに表示" }));
    expect(screen.getByText("msg 0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "さらに表示" })).not.toBeInTheDocument();
  });
});

describe("Expanded", () => {
  it("未選択は「会話を選択」。行を押すと右に会話（履歴は置き換え）、選択中の行は aria-current", async () => {
    seed();
    const router = renderAt("/messages", 1000);
    expect(screen.getByText("会話を選択")).toBeInTheDocument();

    await userEvent.click(rowButtons()[1]);
    expect(router.state.location.pathname).toBe(`/messages/${npubEncode(BOB)}`);
    expect(router.state.historyAction).toBe("REPLACE");
    expect(rowButtons()[1]).toHaveAttribute("aria-current", "true");
    expect(rowButtons()[0]).not.toHaveAttribute("aria-current");
    expect(within(screen.getByRole("region")).getByText("bob です")).toBeInTheDocument();
    expect(screen.queryByText("会話を選択")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "戻る" })).not.toBeInTheDocument();
  });
});
