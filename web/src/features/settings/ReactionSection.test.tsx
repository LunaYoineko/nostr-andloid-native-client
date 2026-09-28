import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { installDialogPolyfill } from "../../test/dialog";
import { setDefaultReaction, useDefaultReaction } from "../actions/reactionPrefs";
import { ReactionSection } from "./ReactionSection";

installDialogPolyfill();

afterEach(() => {
  setDefaultReaction("+", null);
});

it("既定はハート。押すと保存され、押し込み状態が替わる", () => {
  render(<ReactionSection />);
  expect(screen.getByRole("button", { name: /ハート/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /スター/ })).toHaveAttribute("aria-pressed", "false");
});

it("スターを選ぶと保存される", async () => {
  const user = userEvent.setup();
  render(<ReactionSection />);
  await user.click(screen.getByRole("button", { name: /スター/ }));
  expect(useDefaultReaction.getState()).toEqual({ content: "⭐", image: null });
  expect(screen.getByRole("button", { name: /スター/ })).toHaveAttribute("aria-pressed", "true");
});

it("その他の絵文字を押すとピッカーを開き、選ぶとその絵文字を既定にする", async () => {
  const user = userEvent.setup();
  render(<ReactionSection />);
  await user.click(screen.getByRole("button", { name: /その他の絵文字/ }));
  const dialog = screen.getByRole("dialog", { name: "リアクション" });
  await user.click(screen.getByRole("button", { name: "😄" }));
  expect(dialog).not.toBeInTheDocument();
  expect(useDefaultReaction.getState().content).toBe("😄");
  expect(screen.getByRole("button", { name: /その他の絵文字/ })).toHaveAttribute("aria-pressed", "true");
});
