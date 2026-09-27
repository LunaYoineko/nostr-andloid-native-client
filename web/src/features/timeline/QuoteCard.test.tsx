import { screen } from "@testing-library/react";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { unixNow } from "../../lib/time";
import { eventStore } from "../../nostr/store";
import { renderWithRouter } from "../../test/renderWithRouter";
import { QuoteCard } from "./QuoteCard";

const CARD = { name: "引用元の投稿を開く" } as const;

function storedWithImages() {
  const event = finalizeEvent(
    {
      kind: 1,
      created_at: unixNow(),
      tags: [],
      content: "写真 2 枚 https://i.test/1.jpg https://i.test/2.png",
    },
    generateSecretKey(),
  );
  eventStore.add(event);
  return event;
}

it("既定では引用元の画像をサムネイルで出す", () => {
  const quoted = storedWithImages();
  renderWithRouter(<QuoteCard pointer={{ id: quoted.id }} encoded={null} />);

  const card = screen.getByRole("link", CARD);
  expect(card.querySelectorAll("img")).toHaveLength(2);
});

it("compact ではメディアを出さず、本文は出す（#460）", () => {
  const quoted = storedWithImages();
  renderWithRouter(<QuoteCard pointer={{ id: quoted.id }} encoded={null} compact />);

  const card = screen.getByRole("link", CARD);
  expect(card.querySelectorAll("img")).toHaveLength(0);
  expect(card).toHaveTextContent("写真 2 枚");
});
