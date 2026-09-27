import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RelayIndicator, relayAggregate } from "./RelayIndicator";

vi.mock("../nostr/pool", () => ({
  useRelayConnections: () => ({ connected: 0, total: 4 }),
}));

it("relayAggregate は全接続 / 一部 / 無しに分ける", () => {
  expect(relayAggregate(4, 4)).toBe("all");
  expect(relayAggregate(1, 4)).toBe("some");
  expect(relayAggregate(0, 4)).toBe("none");
  expect(relayAggregate(0, 0)).toBe("none");
});

it("接続数を読み上げ用のラベルに出す", () => {
  render(<RelayIndicator orientation="horizontal" />);
  expect(screen.getByRole("img", { name: "リレー接続 0/4" })).toBeInTheDocument();
});
