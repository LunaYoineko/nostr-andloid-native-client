import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRelayConnections } from "../nostr/pool";
import { ConnectionPill } from "./ConnectionPill";

vi.mock("../nostr/pool", () => ({
  useRelayConnections: vi.fn(() => ({ connected: 0, total: 4 })),
}));

function setConnections(connected: number, total: number) {
  vi.mocked(useRelayConnections).mockReturnValue({ connected, total });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("接続 0 の間だけ出て、2 秒ごとに文言を回し、再び出るときは先頭から", () => {
  setConnections(0, 4);
  const { rerender } = render(<ConnectionPill />);
  expect(screen.getByRole("status", { name: "リレーに接続中" })).toHaveTextContent("リレーに接続中…");

  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(screen.getByRole("status")).toHaveTextContent("ダチョウを追いかけています…");

  setConnections(1, 4);
  rerender(<ConnectionPill />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();

  setConnections(0, 4);
  rerender(<ConnectionPill />);
  expect(screen.getByRole("status")).toHaveTextContent("リレーに接続中…");
});

it("リレーが 0 件（0/0）なら出さない", () => {
  setConnections(0, 0);
  render(<ConnectionPill />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
