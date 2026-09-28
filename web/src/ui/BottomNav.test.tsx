import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { NavKey } from "../app/navState";
import { BottomNav } from "./BottomNav";

const NONE: Record<NavKey, boolean> = {
  home: false,
  search: false,
  messages: false,
  notifications: false,
  settings: false,
};

it("ホーム・検索・メッセージ・通知・設定の順に並び、ラベル文字は描かない", () => {
  render(<BottomNav selected={NONE} onSelect={() => {}} />);
  const nav = screen.getByRole("navigation", { name: "メイン" });
  expect(
    within(nav)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label")),
  ).toEqual(["ホーム", "検索", "メッセージ", "通知", "設定"]);
  expect(screen.queryByText("ホーム")).not.toBeInTheDocument();
});

it("選択中の宛先だけ aria-current=page、押すと onSelect", async () => {
  const onSelect = vi.fn();
  render(<BottomNav selected={{ ...NONE, notifications: true }} onSelect={onSelect} />);

  for (const button of screen.getAllByRole("button")) {
    if (button.getAttribute("aria-label") === "通知") expect(button).toHaveAttribute("aria-current", "page");
    else expect(button).not.toHaveAttribute("aria-current");
  }

  await userEvent.click(screen.getByRole("button", { name: "検索" }));
  expect(onSelect).toHaveBeenCalledWith("search");
});

it("メッセージの未読数をアイコンに重ねる（99+ まで）。0 なら出さない", () => {
  const { rerender } = render(<BottomNav selected={NONE} badges={{ messages: 3 }} onSelect={() => {}} />);
  expect(screen.getByRole("button", { name: "メッセージ（未読 3 件）" })).toHaveTextContent("3");

  rerender(<BottomNav selected={NONE} badges={{ messages: 150 }} onSelect={() => {}} />);
  expect(screen.getByRole("button", { name: "メッセージ（未読 150 件）" })).toHaveTextContent("99+");

  rerender(<BottomNav selected={NONE} badges={{ messages: 0 }} onSelect={() => {}} />);
  expect(screen.getByRole("button", { name: "メッセージ" }).textContent).toBe("");
});
