import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ContentWarning } from "./ContentWarning";

it("見出し・理由・「表示」を出し、押すと onReveal を 1 回呼ぶ", async () => {
  const onReveal = vi.fn();
  render(<ContentWarning reason="nsfw" onReveal={onReveal} />);

  const button = screen.getByRole("button");
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("センシティブな内容")).toBeInTheDocument();
  expect(screen.getByText("nsfw")).toBeInTheDocument();
  expect(screen.getByText("表示")).toBeInTheDocument();

  await userEvent.click(button);

  expect(onReveal).toHaveBeenCalledTimes(1);
});

it("理由が空なら 2 行目を出さない", () => {
  render(<ContentWarning reason="" onReveal={() => {}} />);

  expect(screen.getByRole("button")).toHaveTextContent(/^センシティブな内容表示$/);
});
