import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { createMemoryRouter, RouterProvider } from "react-router";
import { EMPTY } from "rxjs";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { requestOnce, resetRelays } from "../../nostr/pool";
import { publishEvent } from "../../nostr/publish";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { installDialogPolyfill } from "../../test/dialog";
import { clearViewport, mockViewport } from "../../test/viewport";
import { ADD_RELAY_STATE } from "../settings/RelaySection";
import { SettingsScreen } from "../settings/SettingsScreen";
import { ProfileRelays } from "./ProfileRelays";

// リレーには繋がない（保存の直前の取り直しは即完了）
vi.mock("../../nostr/pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/pool")>()),
  requestOnce: vi.fn(() => EMPTY),
}));

// 署名・送信はしない
vi.mock("../../nostr/publish", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/publish")>()),
  publishEvent: vi.fn(async () => ({})),
}));

// キャッシュ消去は DB を消して再読み込みするので差し替える
vi.mock("../settings/cache", () => ({ clearCacheAndReload: vi.fn(async () => {}) }));

let other: string;

beforeAll(() => {
  installDialogPolyfill();
});

beforeEach(() => {
  // 既定リレー（en-US）= relay.damus.io / nos.lol の read + write
  localStorage.clear();
  resetRelays();
  useSession.setState({ status: "in", method: "nip07", pubkey: getPublicKey(generateSecretKey()) });
  vi.mocked(requestOnce).mockClear();
  vi.mocked(publishEvent).mockClear();
  const key = generateSecretKey();
  other = getPublicKey(key);
  eventStore.add(
    finalizeEvent(
      {
        kind: 10002,
        created_at: 1_000,
        tags: [
          ["r", "wss://their.example", "read"],
          ["r", "wss://nos.lol"],
        ],
        content: "",
      },
      key,
    ),
  );
});

afterEach(() => {
  clearViewport();
  useSession.setState({ status: "loading", method: null, pubkey: null });
  resetRelays();
});

function rows() {
  return within(screen.getByRole("list", { name: "リレーの一覧" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent?.replace(/ReadWrite削除$/, ""));
}

it("使用リレーの「追加」→ リレー設定の下書きに read + write で入り、「保存」まで発行しない", async () => {
  mockViewport(1000);
  const router = createMemoryRouter(
    [
      { path: "/p/:ref", element: <ProfileRelays pubkey={other} /> },
      { path: "/settings/:section?", element: <SettingsScreen /> },
    ],
    { initialEntries: ["/p/someone"] },
  );
  render(<RouterProvider router={router} />);

  await userEvent.click(screen.getByRole("button", { name: /使用リレー \(2\)/ }));
  // 自分の一覧にあるもの（nos.lol）は「追加済み」
  expect(screen.getByText("追加済み")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "nos.lol を自分のリレーに追加" })).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "their.example を自分のリレーに追加" }));
  expect(router.state.location.pathname).toBe("/settings/relays");
  expect(await screen.findByRole("checkbox", { name: "their.example の Read" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "their.example の Write" })).toBeChecked();
  expect(rows()).toEqual(["relay.damus.io", "nos.lol", "their.example"]);
  // 足した後は state から外す（戻る・再読み込みで足し直さない）
  expect(router.state.location.state).not.toHaveProperty(ADD_RELAY_STATE);
  expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "保存" }));
  const dialog = screen.getByRole("dialog", { name: "リレーリストを公開しますか？" });
  await userEvent.click(within(dialog).getByRole("button", { name: "公開する" }));
  expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(publishEvent).mock.calls[0][0]).toMatchObject({
    kind: 10002,
    tags: [
      ["r", "wss://relay.damus.io"],
      ["r", "wss://nos.lol"],
      ["r", "wss://their.example"],
    ],
  });
});
