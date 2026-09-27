import { render, screen } from "@testing-library/react";
import { npubEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { shortNpub } from "../../lib/npub";
import { eventStore } from "../../nostr/store";
import { NoteContent } from "./NoteContent";

function note(content: string, tags: string[][] = []): NostrEvent {
  return finalizeEvent({ kind: 1, created_at: 1_800_000_000, tags, content }, generateSecretKey());
}

it("テキスト・リンク・#タグ・メンション（名前解決）を要素にする", async () => {
  const aliceKey = generateSecretKey();
  const alice = getPublicKey(aliceKey);
  eventStore.add(
    finalizeEvent(
      {
        kind: 0,
        created_at: 1_800_000_000,
        tags: [],
        content: JSON.stringify({ name: "alice", display_name: "Alice" }),
      },
      aliceKey,
    ),
  );

  const { container } = render(
    <NoteContent
      event={note(`こんにちは https://example.com/page #nostr\nnostr:${npubEncode(alice)} おわり`, [
        ["t", "nostr"],
      ])}
    />,
  );

  const link = screen.getByRole("link", { name: "https://example.com/page" });
  expect(link).toHaveAttribute("href", "https://example.com/page");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
  expect(screen.getByText("#nostr")).toBeInTheDocument();
  expect(await screen.findByText("@Alice")).toBeInTheDocument();
  expect(container).toHaveTextContent(/^こんにちは https:\/\/example\.com\/page #nostr @Alice おわり$/);
});

it("名前が無いメンションは npub の短縮、画像 URL はリンクのまま、HTML は文字として出す", () => {
  const unknown = getPublicKey(generateSecretKey());
  const { container } = render(
    <NoteContent
      event={note(
        `<b>bold</b> nostr:${npubEncode(unknown)}\nhttps://img.example/a.png\nhttps://img.example/b.jpg`,
      )}
    />,
  );

  expect(container.querySelector("b")).toBeNull();
  expect(container).toHaveTextContent("<b>bold</b>");
  expect(screen.getByText(`@${shortNpub(unknown)}`)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "https://img.example/a.png" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "https://img.example/b.jpg" })).toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull();
});
