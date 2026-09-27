import { neventEncode, npubEncode } from "nostr-tools/nip19";
import { expect, it } from "vitest";
import { hrefForEvent, hrefForProfile, hrefForTag, mentionLabel, oneLine, shortUrlLabel } from "./labels";

const PUBKEY = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
const ID = "a".repeat(64);

it("oneLine は改行・タブ・全角空白・連続空白を 1 つの空白に潰す", () => {
  expect(oneLine("a\n\n b\t　c")).toBe("a b c");
  expect(oneLine("  \r\n x  ")).toBe("x");
});

it("shortUrlLabel はスキームと www. を除き、28 文字を超えたら 28 文字 + …", () => {
  expect(shortUrlLabel("https://www.example.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(
    `${"example.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".slice(0, 28)}…`,
  );
  expect(shortUrlLabel("http://example.com/a")).toBe("example.com/a");
});

it("mentionLabel は npub を @名前（無ければ先頭 12 文字 + …）、nevent を ↗ + 先頭 12 文字 + … にする", () => {
  const npub = npubEncode(PUBKEY);
  const nevent = neventEncode({ id: ID });
  expect(mentionLabel(npub, "Alice")).toBe("@Alice");
  expect(mentionLabel(npub)).toBe(`@${npub.slice(0, 12)}…`);
  expect(mentionLabel(nevent)).toBe(`↗${nevent.slice(0, 12)}…`);
});

it("アプリ内のリンク先（/app は付けない）", () => {
  expect(hrefForProfile(PUBKEY)).toBe(`/p/${npubEncode(PUBKEY)}`);
  expect(hrefForEvent("note1xyz")).toBe("/e/note1xyz");
  expect(hrefForEvent({ id: ID })).toBe(`/e/${neventEncode({ id: ID })}`);
  expect(hrefForTag("日本語")).toBe(`/t/${encodeURIComponent("日本語")}`);
  expect(hrefForTag("日本語")).toBe("/t/%E6%97%A5%E6%9C%AC%E8%AA%9E");
});
