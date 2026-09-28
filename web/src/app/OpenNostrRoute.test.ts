import {
  naddrEncode,
  neventEncode,
  noteEncode,
  nprofileEncode,
  npubEncode,
  nsecEncode,
} from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import { resolveNostrUri } from "./OpenNostrRoute";

const pubkey = getPublicKey(generateSecretKey());

describe("resolveNostrUri", () => {
  it("npub / nprofile は /p/ へ（web+nostr: / nostr: のどちらも外す）", () => {
    const npub = npubEncode(pubkey);
    expect(resolveNostrUri(`web+nostr:${npub}`)).toBe(`/p/${npub}`);
    expect(resolveNostrUri(`nostr:${npub}`)).toBe(`/p/${npub}`);

    const nprofile = nprofileEncode({ pubkey, relays: ["wss://relay.test"] });
    expect(resolveNostrUri(`web+nostr:${nprofile}`)).toBe(`/p/${nprofile}`);
  });

  it("note / nevent / naddr は /e/ へ", () => {
    const note = noteEncode("a".repeat(64));
    expect(resolveNostrUri(`web+nostr:${note}`)).toBe(`/e/${note}`);

    const nevent = neventEncode({ id: "b".repeat(64) });
    expect(resolveNostrUri(`nostr:${nevent}`)).toBe(`/e/${nevent}`);

    const naddr = naddrEncode({ kind: 30023, pubkey, identifier: "article" });
    expect(resolveNostrUri(`web+nostr:${naddr}`)).toBe(`/e/${naddr}`);
  });

  it("nsec 等・読めない値は null（絶対に通さない）", () => {
    expect(resolveNostrUri(`web+nostr:${nsecEncode(generateSecretKey())}`)).toBeNull();
    expect(resolveNostrUri("web+nostr:not-bech32")).toBeNull();
    expect(resolveNostrUri("")).toBeNull();
  });

  it("スキームの大文字小文字・前後の空白は無視する", () => {
    const npub = npubEncode(pubkey);
    expect(resolveNostrUri(`  WEB+NOSTR:${npub}  `)).toBe(`/p/${npub}`);
  });
});
