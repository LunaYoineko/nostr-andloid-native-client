import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Subject } from "rxjs";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { setPublishAccount, unconfirmed$ } from "../../nostr/publish";
import { useSession } from "../../signer/session";
import { installDialogPolyfill } from "../../test/dialog";
import { PUBKEY } from "../../test/fakeNostr";
import { renderWithRouter } from "../../test/renderWithRouter";
import { useToast } from "../../ui/toast";
import { ComposeHost } from "./ComposeHost";
import { useCompose } from "./composeStore";

// 「確認できなかった」はテストから流す
vi.mock("../../nostr/publish", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../nostr/publish")>();
  const { Subject } = await import("rxjs");
  return { ...actual, unconfirmed$: new Subject<void>(), setPublishAccount: vi.fn() };
});

beforeAll(() => {
  installDialogPolyfill();
});

beforeEach(() => {
  useSession.setState({ status: "in", method: "nip07", pubkey: PUBKEY });
});

afterEach(() => {
  vi.useRealTimers();
  useCompose.setState({ request: null });
  useToast.setState({ queue: [] });
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

it("showFab なら「投稿」ボタン。押すと投稿シートを開く。ログイン中のアカウントを送信キューへ伝える", async () => {
  renderWithRouter(<ComposeHost showFab />);
  expect(setPublishAccount).toHaveBeenCalledWith(PUBKEY);
  await userEvent.click(screen.getByRole("button", { name: "投稿" }));
  expect(screen.getByRole("dialog", { name: "投稿" })).toBeInTheDocument();
});

it("showFab={false} ならボタンを出さない", () => {
  renderWithRouter(<ComposeHost showFab={false} />);
  expect(screen.queryByRole("button", { name: "投稿" })).toBeNull();
});

it("受理を確認できなかったらトーストを 2 秒出す", () => {
  vi.useFakeTimers();
  renderWithRouter(<ComposeHost showFab={false} />);
  act(() => (unconfirmed$ as Subject<void>).next());
  expect(screen.getByRole("status")).toHaveTextContent(
    "送信を確認できませんでした。接続が戻ったら自動で再送します",
  );
  act(() => vi.advanceTimersByTime(2_000));
  expect(screen.queryByRole("status")).toBeNull();
});
