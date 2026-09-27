import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { afterEach, expect, it } from "vitest";
import { CollapsibleContent } from "./CollapsibleContent";
import styles from "./CollapsibleContent.module.css";

const event = finalizeEvent(
  { kind: 1, created_at: 1_800_000_000, tags: [], content: "本文" },
  generateSecretKey(),
);

/** jsdom はレイアウトしないので、はみ出し判定に使う高さを差し替える */
function setHeights(scrollHeight: number, clientHeight: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
}

afterEach(() => {
  // 差し替えを外して Element.prototype の既定（0）に戻す
  Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
});

it("はみ出していれば「もっと見る」を出し、押すと「閉じる」になって折りたたみを外す", async () => {
  setHeights(200, 160);
  render(
    <CollapsibleContent event={event}>
      <p>本文</p>
    </CollapsibleContent>,
  );

  const body = screen.getByText("本文").parentElement;
  expect(body).toHaveClass(styles.clamp);
  const more = screen.getByRole("button", { name: "もっと見る" });
  expect(more).toHaveAttribute("aria-expanded", "false");

  await userEvent.click(more);

  const close = screen.getByRole("button", { name: "閉じる" });
  expect(close).toHaveAttribute("aria-expanded", "true");
  expect(body).not.toHaveClass(styles.clamp);

  await userEvent.click(close);
  expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument();
  expect(body).toHaveClass(styles.clamp);
});

it("はみ出していなければボタンを出さない", () => {
  setHeights(160, 160);
  render(
    <CollapsibleContent event={event}>
      <p>本文</p>
    </CollapsibleContent>,
  );

  expect(screen.queryByRole("button")).toBeNull();
});
