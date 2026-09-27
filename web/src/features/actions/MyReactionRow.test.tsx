import { screen } from "@testing-library/react";
import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { unixNow } from "../../lib/time";
import { eventStore } from "../../nostr/store";
import { renderWithRouter } from "../../test/renderWithRouter";
import { MyReactionRow } from "./MyReactionRow";

/** 名前付きの作者の投稿をストアに入れる */
function storedTarget(name: string, content: string): NostrEvent {
  const key = generateSecretKey();
  eventStore.add(
    finalizeEvent({ kind: 0, created_at: unixNow(), tags: [], content: JSON.stringify({ name }) }, key),
  );
  const target = finalizeEvent({ kind: 1, created_at: unixNow(), tags: [], content }, key);
  eventStore.add(target);
  return target;
}

function reactionTo(
  target: NostrEvent | { id: string; pubkey: string },
  content: string,
  tags: string[][] = [],
) {
  return finalizeEvent(
    {
      kind: 7,
      created_at: unixNow(),
      tags: [["e", target.id], ["p", target.pubkey], ...tags],
      content,
    },
    generateSecretKey(),
  );
}

it("+ のリアクションは ❤️・「あなたがリアクション」・「名前: 本文」でスレッドへのリンク", async () => {
  const target = storedTarget("alice", "こんにちは\n世界");
  renderWithRouter(<MyReactionRow reaction={reactionTo(target, "+")} />);

  const link = await screen.findByRole("link");
  expect(link).toHaveTextContent("❤️");
  expect(link).toHaveTextContent("あなたがリアクション");
  expect(await screen.findByText("alice: こんにちは 世界")).toBeVisible();
  expect(link.getAttribute("href")).toMatch(/\/e\/nevent1/);
});

it("カスタム絵文字は画像（alt は :code:）", async () => {
  const target = storedTarget("bob", "本文");
  renderWithRouter(
    <MyReactionRow reaction={reactionTo(target, ":cat:", [["emoji", "cat", "https://e/cat.png"]])} />,
  );
  expect(await screen.findByRole("img", { name: ":cat:" })).toBeInTheDocument();
});

it("対象がストアに無ければ何も書かない", () => {
  const missing = { id: "f".repeat(64), pubkey: "e".repeat(64) };
  const { container } = renderWithRouter(<MyReactionRow reaction={reactionTo(missing, "+")} />);
  expect(container.textContent).toBe("");
  expect(screen.queryByRole("link")).toBeNull();
});
