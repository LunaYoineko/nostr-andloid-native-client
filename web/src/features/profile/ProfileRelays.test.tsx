import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { afterEach, beforeEach, expect, it } from "vitest";
import { loadRelayTable, relayRows, resetRelays, unloadRelayTable, useRelays } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { useToast } from "../../ui/toast";
import { ProfileRelays } from "./ProfileRelays";

let other: string;

beforeEach(() => {
  // 既定リレー（en-US）= relay.damus.io / nos.lol の read + write
  localStorage.clear();
  resetRelays();
  const me = getPublicKey(generateSecretKey());
  useSession.setState({ status: "in", method: "nip07", pubkey: me });
  loadRelayTable(me);
  useToast.setState({ queue: [] });
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
  useSession.setState({ status: "loading", method: null, pubkey: null });
  unloadRelayTable();
  resetRelays();
});

it("使用リレーの「追加」→ 遷移せず即座に自分のリレー（手動）へ入り、接続先が増えてトーストが出る（#585）", async () => {
  render(<ProfileRelays pubkey={other} />);

  await userEvent.click(screen.getByRole("button", { name: /使用リレー \(2\)/ }));
  // 自分の一覧にあるもの（nos.lol）は「追加済み」
  expect(screen.getByText("追加済み")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "nos.lol を自分のリレーに追加" })).toBeNull();
  expect(relayRows().some((r) => r.url === "wss://their.example/")).toBe(false);

  await userEvent.click(screen.getByRole("button", { name: "their.example を自分のリレーに追加" }));

  // 保存という概念は無く、接続先（リレー表）へ即反映する
  expect(relayRows()).toContainEqual({
    url: "wss://their.example/",
    read: true,
    write: true,
    source: "manual",
  });
  expect(useRelays.getState().read).toContain("wss://their.example/");
  expect(useToast.getState().queue).toEqual(["自分のリレーに追加しました"]);
  // 追加済みに変わり、ボタンは消える（画面は変わらない）
  expect(within(screen.getByRole("list")).getAllByText("追加済み")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: /を自分のリレーに追加/ })).toBeNull();
});

it("既に自分のリレーにあれば「追加済み」を出し、押せない", async () => {
  render(<ProfileRelays pubkey={other} />);
  await userEvent.click(screen.getByRole("button", { name: /使用リレー \(2\)/ }));

  const item = within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .find((li) => li.textContent?.includes("nos.lol"));
  expect(item).toBeDefined();
  expect(within(item as HTMLElement).getByText("追加済み")).toBeInTheDocument();
  expect(within(item as HTMLElement).queryByRole("button")).toBeNull();
});
