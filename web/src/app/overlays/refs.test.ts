import { naddrEncode, neventEncode, noteEncode, nprofileEncode, npubEncode } from "nostr-tools/nip19";
import { describe, expect, it } from "vitest";
import { OTHER_PUBKEY, PUBKEY } from "../../test/fakeNostr";
import { parseEventRef, parseProfileRef } from "./refs";

const ID = "5c83da77af1dec6d7289834998ad7aafbd9e2191396d75ec3cc27f5a77226f36";

describe("parseEventRef", () => {
  it("note1… / nevent1…（relays 付き）/ 64 桁 hex（大文字は小文字へ）/ nostr: 付きを読む", () => {
    expect(parseEventRef(noteEncode(ID))).toEqual({ id: ID });
    expect(parseEventRef(neventEncode({ id: ID, relays: ["wss://r"] }))).toMatchObject({
      id: ID,
      relays: ["wss://r"],
    });
    expect(parseEventRef(ID.toUpperCase())).toEqual({ id: ID });
    expect(parseEventRef(`nostr:${noteEncode(ID)}`)).toEqual({ id: ID });
  });

  it("naddr1…（relays 付き）は AddressPointer（#534）", () => {
    expect(parseEventRef(naddrEncode({ kind: 30023, pubkey: PUBKEY, identifier: "d" }))).toMatchObject({
      kind: 30023,
      pubkey: PUBKEY,
      identifier: "d",
    });
    expect(
      parseEventRef(
        `nostr:${naddrEncode({ kind: 30023, pubkey: PUBKEY, identifier: "d", relays: ["wss://r"] })}`,
      ),
    ).toMatchObject({ kind: 30023, pubkey: PUBKEY, identifier: "d", relays: ["wss://r"] });
  });

  it("読めない ref と別種の bech32 は null", () => {
    expect(parseEventRef("abc")).toBeNull();
    expect(parseEventRef(npubEncode(PUBKEY))).toBeNull();
  });
});

describe("parseProfileRef", () => {
  it("npub1… / nprofile1…（relays 付き）/ 64 桁 hex / nostr: 付きを読む", () => {
    expect(parseProfileRef(npubEncode(PUBKEY))).toEqual({ pubkey: PUBKEY });
    expect(parseProfileRef(nprofileEncode({ pubkey: OTHER_PUBKEY, relays: ["wss://r"] }))).toEqual({
      pubkey: OTHER_PUBKEY,
      relays: ["wss://r"],
    });
    expect(parseProfileRef(PUBKEY.toUpperCase())).toEqual({ pubkey: PUBKEY });
    expect(parseProfileRef(`nostr:${npubEncode(PUBKEY)}`)).toEqual({ pubkey: PUBKEY });
  });

  it("読めない ref と別種の bech32 は null", () => {
    expect(parseProfileRef("abc")).toBeNull();
    expect(parseProfileRef(noteEncode(ID))).toBeNull();
  });
});
