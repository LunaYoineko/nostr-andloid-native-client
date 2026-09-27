import { decode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { afterEach, expect, it, vi } from "vitest";
import { unixNow } from "../../lib/time";
import { useToast } from "../../ui/toast";
import { copyText, noteLinksOf, plainTextOf } from "./noteLinks";

afterEach(() => {
  useToast.setState({ queue: [] });
  Reflect.deleteProperty(navigator, "clipboard");
});

// applesauce の Tokens.link はホストにドットを要求するため、テストの URL は *.test にする
function post(content: string, kind = 1): NostrEvent {
  return finalizeEvent({ kind, created_at: unixNow(), tags: [], content }, generateSecretKey());
}

it("plainTextOf: 画像 URL を除き、空白と空行を詰める", () => {
  const event = post("こんにちは  https://img.test/a.png  です\n\n\n\n次の行 https://example.test/page");
  expect(plainTextOf(event)).toBe("こんにちは です\n\n次の行 https://example.test/page");
});

it("plainTextOf: 画像だけの投稿は content そのまま", () => {
  const event = post("https://img.test/a.png");
  expect(plainTextOf(event)).toBe("https://img.test/a.png");
});

it("noteLinksOf: nevent に id・作者・kind が入り、njump は nevent を開く", () => {
  const event = post("本文", 1111);
  const links = noteLinksOf(event);
  expect(decode(links.note1)).toEqual({ type: "note", data: event.id });
  const decoded = decode(links.nevent);
  expect(decoded.type).toBe("nevent");
  if (decoded.type !== "nevent") return;
  expect(decoded.data).toMatchObject({ id: event.id, author: event.pubkey, kind: 1111 });
  expect(links.njump).toBe(`https://njump.me/${links.nevent}`);
  expect(links.njump.startsWith("https://njump.me/nevent1")).toBe(true);
});

it("copyText: 書けたら「コピーしました」、失敗したら「コピーできませんでした」", async () => {
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("denied"));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  await copyText("abc");
  await copyText("def");
  expect(writeText).toHaveBeenNthCalledWith(1, "abc");
  expect(useToast.getState().queue).toEqual(["コピーしました", "コピーできませんでした"]);
});
