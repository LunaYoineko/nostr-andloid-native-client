import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { resetRelays, useRelays } from "../nostr/pool";
import { installDialogPolyfill } from "../test/dialog";
import { RelayIndicator, relayAggregate } from "./RelayIndicator";

vi.mock("../nostr/pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../nostr/pool")>()),
  useRelayConnections: () => ({ connected: 0, total: 4 }),
}));

beforeAll(() => {
  installDialogPolyfill();
});

afterEach(() => {
  resetRelays();
});

it("relayAggregate は全接続 / 一部 / 無しに分ける", () => {
  expect(relayAggregate(4, 4)).toBe("all");
  expect(relayAggregate(1, 4)).toBe("some");
  expect(relayAggregate(0, 4)).toBe("none");
  expect(relayAggregate(0, 0)).toBe("none");
});

it("接続数を読み上げ用のラベルに出す", () => {
  render(<RelayIndicator orientation="horizontal" />);
  expect(screen.getByRole("button", { name: "リレー接続 0/4" })).toBeInTheDocument();
});

it("押すとリレー状態の一覧（read リレーごとに URL と状態）を開き、「閉じる」で閉じる", async () => {
  useRelays.setState({
    read: ["wss://b.example", "wss://a.example"],
    write: ["wss://a.example"],
    source: "nip65",
  });
  render(<RelayIndicator orientation="vertical" />);
  await userEvent.click(screen.getByRole("button", { name: "リレー接続 0/4" }));

  const dialog = screen.getByRole("dialog", { name: "リレー状態" });
  const rows = within(dialog)
    .getAllByRole("listitem")
    .map((li) => li.textContent);
  // 接続していない（REQ も無い）リレーは「切断」
  expect(rows).toEqual(["a.example切断", "b.example切断"]);

  await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
  expect(screen.queryByRole("dialog", { name: "リレー状態" })).toBeNull();
});

it("read リレーが無ければ「接続中のリレーはありません」", async () => {
  useRelays.setState({ read: [], write: [], source: "nip65" });
  render(<RelayIndicator orientation="horizontal" />);
  await userEvent.click(screen.getByRole("button", { name: "リレー接続 0/4" }));
  expect(
    within(screen.getByRole("dialog", { name: "リレー状態" })).getByText("接続中のリレーはありません"),
  ).toBeInTheDocument();
});
