import { render, screen } from "@testing-library/react";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { unixNow } from "../../lib/time";
import { eventStore } from "../../nostr/store";
import { NoteItem } from "./NoteItem";

it("kind:6 は「〜がリポスト」の行と content に埋め込まれた元投稿を出す", async () => {
  const reposterKey = generateSecretKey();
  eventStore.add(
    finalizeEvent(
      { kind: 0, created_at: unixNow(), tags: [], content: JSON.stringify({ name: "bob" }) },
      reposterKey,
    ),
  );
  const original = finalizeEvent(
    { kind: 1, created_at: unixNow() - 180, tags: [], content: "元の投稿です" },
    generateSecretKey(),
  );
  const repost = finalizeEvent(
    {
      kind: 6,
      created_at: unixNow(),
      tags: [
        ["e", original.id],
        ["p", original.pubkey],
      ],
      content: JSON.stringify(original),
    },
    reposterKey,
  );

  render(<NoteItem event={repost} />);

  expect(await screen.findByText("bob")).toBeInTheDocument();
  expect(screen.getByText("がリポスト")).toBeInTheDocument();
  expect(screen.getByText("元の投稿です")).toBeInTheDocument();
  expect(screen.getByText("3m")).toBeInTheDocument();
});
