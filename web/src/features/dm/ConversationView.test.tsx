import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DmMessageRow } from "../../db/schema";
import { retryUnsentNow, unsent$ } from "../../nostr/publish";
import { OTHER_PUBKEY, PUBKEY } from "../../test/fakeNostr";
import { renderWithRouter } from "../../test/renderWithRouter";
import { useToast } from "../../ui/toast";
import { ConversationView } from "./ConversationView";
import { useDm } from "./dmStore";
import { type DmSendResult, sendDm } from "./send";

// 送信はしない（結果はテストごとに返す）
vi.mock("./send", () => ({ sendDm: vi.fn() }));

vi.mock("../../nostr/publish", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/publish")>()),
  retryUnsentNow: vi.fn(),
}));

const ME = PUBKEY;
const PEER = OTHER_PUBKEY;

beforeEach(() => {
  vi.mocked(sendDm).mockReset();
  vi.mocked(retryUnsentNow).mockClear();
  useDm.getState().reset(ME);
  useDm.setState({ loaded: true });
  useToast.setState({ queue: [] });
});

afterEach(() => {
  useDm.getState().reset(null);
  unsent$.next(new Set());
});

function dm(id: string, sender: string, content: string, peer = PEER): DmMessageRow {
  return { owner: ME, id, peer, sender, content, tags: [], createdAt: 1_700_000_000, proto: "nip17" };
}

/** 送ったら自分の吹き出しを出して result を返す（sendDm の楽観表示の代わり） */
function sendResolves(result: DmSendResult) {
  vi.mocked(sendDm).mockImplementation(async (peer, text) => {
    if (result === "sent" || result === "sent-no-peer-relays") {
      useDm.getState().upsertMessages([dm(`sent-${text}`, ME, text, peer)]);
    }
    return result;
  });
}

function input(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: "メッセージ" });
}

function sendButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "送信" });
}

function toasts(): string[] {
  return useToast.getState().queue;
}

describe("入力欄", () => {
  it("送信で入力が空になり吹き出しが出る。送信中は入力と送信を止める。空白だけでは押せない", async () => {
    let finish: (result: DmSendResult) => void = () => {};
    vi.mocked(sendDm).mockImplementation(
      (peer, text) =>
        new Promise((resolve) => {
          finish = (result) => {
            useDm.getState().upsertMessages([dm("sent-1", ME, text, peer)]);
            resolve(result);
          };
        }),
    );
    renderWithRouter(<ConversationView peer={PEER} />);
    expect(sendButton()).toBeDisabled();
    await userEvent.type(input(), "   ");
    expect(sendButton()).toBeDisabled();

    await userEvent.clear(input());
    await userEvent.type(input(), "やあ");
    await userEvent.click(sendButton());

    expect(vi.mocked(sendDm)).toHaveBeenCalledWith(PEER, "やあ");
    expect(input()).toBeDisabled();
    expect(sendButton()).toBeDisabled();

    await act(async () => finish("sent"));
    expect(input()).toHaveValue("");
    expect(input()).not.toBeDisabled();
    expect(screen.getByText("やあ")).toBeInTheDocument();
    expect(toasts()).toEqual([]);
  });

  it("Enter は改行、Ctrl / Cmd + Enter で送信。IME 変換中の Ctrl + Enter では送らない", async () => {
    sendResolves("sent");
    renderWithRouter(<ConversationView peer={PEER} />);
    await userEvent.type(input(), "1 行目{Enter}2 行目");
    expect(input()).toHaveValue("1 行目\n2 行目");
    expect(vi.mocked(sendDm)).not.toHaveBeenCalled();

    fireEvent.keyDown(input(), { key: "Enter", ctrlKey: true, isComposing: true });
    expect(vi.mocked(sendDm)).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.keyDown(input(), { key: "Enter", ctrlKey: true });
    });
    expect(vi.mocked(sendDm)).toHaveBeenCalledWith(PEER, "1 行目\n2 行目");
    expect(input()).toHaveValue("");

    await userEvent.type(input(), "cmd");
    await act(async () => {
      fireEvent.keyDown(input(), { key: "Enter", metaKey: true });
    });
    expect(vi.mocked(sendDm)).toHaveBeenLastCalledWith(PEER, "cmd");
  });

  it("「届かない可能性があります」は同じ相手ではセッション中 1 回だけ", async () => {
    const peer = "d".repeat(64);
    sendResolves("sent-no-peer-relays");
    renderWithRouter(<ConversationView peer={peer} />);

    await userEvent.type(input(), "1");
    await userEvent.click(sendButton());
    await userEvent.type(input(), "2");
    await userEvent.click(sendButton());

    expect(toasts()).toEqual(["相手がDMリレーを公開していないため、届かない可能性があります"]);
    expect(input()).toHaveValue("");
  });

  it.each([
    ["failed", "メッセージを送れませんでした"],
    ["no-nip44", "この拡張機能は NIP-44 に対応していないため、このメッセージを送れません"],
    ["no-nip04", "この拡張機能は NIP-04 に対応していないため、このメッセージを送れません"],
    ["no-relays", "送り先のリレーがありません"],
  ] as const)("%s → トースト「%s」。入力は残す", async (result, message) => {
    sendResolves(result);
    renderWithRouter(<ConversationView peer={PEER} />);
    await userEvent.type(input(), "残る");
    await userEvent.click(sendButton());
    expect(toasts()).toEqual([message]);
    expect(input()).toHaveValue("残る");
    expect(sendButton()).not.toBeDisabled();
  });

  it("署名者に NIP-44 も NIP-04 も無ければ入力欄の代わりに案内", () => {
    useDm.setState({ nip17: "no-nip44", nip04: "no-nip04" });
    renderWithRouter(<ConversationView peer={PEER} />);
    expect(screen.getByText("このログイン方法では DM を送れません")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("片方だけ使えれば入力欄を出す", () => {
    useDm.setState({ nip17: "no-nip44", nip04: "ok" });
    renderWithRouter(<ConversationView peer={PEER} />);
    expect(input()).toBeInTheDocument();
  });
});

describe("未送信", () => {
  it("自分の未送信の吹き出しに「未送信・タップで再送」、押すと retryUnsentNow。相手の吹き出しには出さない", async () => {
    useDm.getState().upsertMessages([dm("mine", ME, "送った"), dm("theirs", PEER, "受けた")]);
    renderWithRouter(<ConversationView peer={PEER} />);
    expect(screen.queryByRole("button", { name: "未送信・タップで再送" })).not.toBeInTheDocument();

    act(() => unsent$.next(new Set(["mine", "theirs"])));
    const retry = screen.getAllByRole("button", { name: "未送信・タップで再送" });
    expect(retry).toHaveLength(1);

    await userEvent.click(retry[0]);
    expect(vi.mocked(retryUnsentNow)).toHaveBeenCalledWith("mine");
  });
});
