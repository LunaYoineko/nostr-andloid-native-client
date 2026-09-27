import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { discardUnsent, retryUnsentNow, unsent$ } from "../../nostr/publish";
import { useSession } from "../../signer/session";
import { Toaster } from "../../ui/Toaster";
import { useToast } from "../../ui/toast";
import { useCompose } from "./composeStore";
import { NoteFooter } from "./NoteFooter";
import { loadDraft } from "./storage";

vi.mock("../../nostr/publish", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../nostr/publish")>();
  return { ...actual, retryUnsentNow: vi.fn(), discardUnsent: vi.fn() };
});

let meKey: Uint8Array;

beforeEach(() => {
  meKey = generateSecretKey();
  useSession.setState({ status: "in", method: "nip07", pubkey: getPublicKey(meKey) });
  vi.mocked(retryUnsentNow).mockClear();
  vi.mocked(discardUnsent).mockReset();
});

afterEach(() => {
  act(() => unsent$.next(new Set()));
  localStorage.clear();
  useCompose.setState({ request: null });
  useToast.setState({ queue: [] });
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

function post(key = meKey, content = "本文"): NostrEvent {
  return finalizeEvent({ kind: 1, created_at: 1_800_000_000, tags: [], content }, key);
}

it("「返信」で返信の投稿シートを開く。children は同じ group の「返信」の後", async () => {
  const event = post();
  render(
    <NoteFooter event={event}>
      <button type="button">リポスト</button>
    </NoteFooter>,
  );
  const group = screen.getByRole("group", { name: "操作" });
  expect(
    within(group)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent),
  ).toEqual(["返信", "リポスト"]);

  await userEvent.click(screen.getByRole("button", { name: "返信" }));
  expect(useCompose.getState().request).toEqual({ mode: "reply", target: event });
});

it("自分の未送信に「未送信」。「再送」で retryUnsentNow、「下書きに戻す」で下書きへ + トースト", async () => {
  const user = userEvent.setup();
  const event = post(meKey, "未送信の本文");
  vi.mocked(discardUnsent).mockReturnValue(event);
  act(() => unsent$.next(new Set([event.id])));
  render(
    <>
      <NoteFooter event={event} />
      <Toaster />
    </>,
  );

  await user.click(screen.getByRole("button", { name: "未送信" }));
  await user.click(screen.getByRole("menuitem", { name: "再送" }));
  expect(retryUnsentNow).toHaveBeenCalledWith(event.id);

  await user.click(screen.getByRole("button", { name: "未送信" }));
  await user.click(screen.getByRole("menuitem", { name: "下書きに戻す" }));
  expect(discardUnsent).toHaveBeenCalledWith(event.id);
  expect(loadDraft()).toBe("未送信の本文");
  expect(screen.getByRole("status")).toHaveTextContent("下書きに戻しました");
});

it("他人のイベント・受理済みには「未送信」を出さない", () => {
  const others = post(generateSecretKey());
  const accepted = post();
  act(() => unsent$.next(new Set([others.id])));
  render(
    <>
      <NoteFooter event={others} />
      <NoteFooter event={accepted} />
    </>,
  );
  expect(screen.queryByRole("button", { name: "未送信" })).toBeNull();
});
