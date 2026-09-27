import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { neventEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { ComposeHost } from "../../features/compose/ComposeHost";
import { useCompose } from "../../features/compose/composeStore";
import { unixNow } from "../../lib/time";
import { type EventDraft, publishEvent } from "../../nostr/publish";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { installDialogPolyfill } from "../../test/dialog";
import { renderWithRouter } from "../../test/renderWithRouter";
import { ThreadOverlay } from "./ThreadOverlay";

// リレーには繋がない（REQ は開いたままの Subject）
vi.mock("../../nostr/pool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../nostr/pool")>();
  const { Subject } = await import("rxjs");
  return {
    ...actual,
    relays: ["wss://relay.example"],
    subscribeTo: vi.fn(() => new Subject<"EOSE">()),
    requestOnce: vi.fn(() => new Subject<NostrEvent>()),
  };
});

// 署名・送信はしない
vi.mock("../../nostr/publish", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/publish")>()),
  publishEvent: vi.fn(),
  setPublishAccount: vi.fn(),
}));

let meKey: Uint8Array;

beforeAll(() => {
  installDialogPolyfill();
});

beforeEach(() => {
  meKey = generateSecretKey();
  useSession.setState({ status: "in", method: "nip07", pubkey: getPublicKey(meKey) });
  vi.mocked(publishEvent).mockImplementation(async (draft: EventDraft) =>
    finalizeEvent({ ...draft, created_at: unixNow() }, meKey),
  );
});

afterEach(() => {
  useCompose.setState({ request: null });
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

function stored(tags: string[][], content: string, createdAt: number): NostrEvent {
  const event = finalizeEvent({ kind: 1, created_at: createdAt, tags, content }, generateSecretKey());
  eventStore.add(event);
  return event;
}

it("返信ボックスから起点への返信を送れる（NIP-10 の root → reply）", async () => {
  const user = userEvent.setup();
  const root = stored([], "ルート", 1_000);
  const focus = stored([["e", root.id, "", "root"]], "起点", 1_001);
  renderWithRouter(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 2000, itemHeight: 100 }}>
      <ThreadOverlay refParam={neventEncode({ id: focus.id })} onBack={() => {}} />
      <ComposeHost showFab={false} />
    </VirtuosoMockContext.Provider>,
  );

  await user.click(await screen.findByRole("button", { name: "返信を書く" }));
  const dialog = screen.getByRole("dialog", { name: "返信" });
  await user.type(within(dialog).getByRole("textbox", { name: "本文" }), "スレッドから返信");
  await user.click(within(dialog).getByRole("button", { name: "返信" }));

  expect(publishEvent).toHaveBeenCalledTimes(1);
  const draft = vi.mocked(publishEvent).mock.calls[0][0];
  expect(draft).toMatchObject({ kind: 1, content: "スレッドから返信" });
  expect(draft.tags.slice(0, 3)).toEqual([
    ["e", root.id, expect.any(String), "root", root.pubkey],
    ["e", focus.id, expect.any(String), "reply", focus.pubkey],
    ["p", focus.pubkey, expect.any(String)],
  ]);
  expect(useCompose.getState().request).toBeNull();
});
