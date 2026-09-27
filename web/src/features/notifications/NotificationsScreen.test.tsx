import { screen } from "@testing-library/react";
import { generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import type { Subject } from "rxjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { subscribeTo } from "../../nostr/pool";
import { useSession } from "../../signer/session";
import { renderWithRouter } from "../../test/renderWithRouter";
import { NotificationsScreen } from "./NotificationsScreen";

// リレーには繋がず、REQ ごとに Subject を返す（張った / やめたを observed で見る）
vi.mock("../../nostr/pool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../nostr/pool")>();
  const { Subject } = await import("rxjs");
  return {
    ...actual,
    relays: ["wss://relay.example"],
    subscribe: vi.fn(() => new Subject<"EOSE">()),
    subscribeTo: vi.fn(() => new Subject<"EOSE">()),
    requestOnce: vi.fn(() => new Subject<NostrEvent>()),
  };
});

let me: string;

beforeEach(() => {
  me = getPublicKey(generateSecretKey());
  useSession.setState({ status: "in", method: "nip07", pubkey: me });
  vi.mocked(subscribeTo).mockClear();
});

afterEach(() => {
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

it("見出しと説明を出し、自分宛ての 6 種を 200 件で購読する。閉じたら購読をやめる", () => {
  const { unmount } = renderWithRouter(<NotificationsScreen />);

  expect(screen.getByRole("heading", { name: "通知" })).toBeInTheDocument();
  expect(screen.getByText("メンション・リアクション・リポスト")).toBeInTheDocument();
  expect(screen.getByText("読み込み中…")).toBeInTheDocument();

  const { calls, results } = vi.mocked(subscribeTo).mock;
  expect(calls).toEqual([
    [["wss://relay.example"], [{ kinds: [1, 6, 16, 7, 9735, 1111], "#p": [me], limit: 200 }]],
  ]);
  const req = results[0].value as Subject<"EOSE">;
  expect(req.observed).toBe(true);

  unmount();
  expect(req.observed).toBe(false);
});
