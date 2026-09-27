import { afterEach, describe, expect, it } from "vitest";
import {
  applyRelayPrefs,
  defaultRelaysFor,
  initialRelaySet,
  RELAYS_KEY,
  relayListFrom,
  relaySetFromPrefs,
  resetRelays,
  useRelays,
} from "./pool";

it("既定リレーは ja 系なら日本向けを含む 4 つ、それ以外は damus / nos.lol（DefaultRelays.kt と同じ）", () => {
  const ja = ["wss://relay-jp.shino3.net", "wss://yabu.me", "wss://relay.damus.io", "wss://nos.lol"];
  expect(defaultRelaysFor("ja")).toEqual(ja);
  expect(defaultRelaysFor("ja-JP")).toEqual(ja);
  expect(defaultRelaysFor("en-US")).toEqual(["wss://relay.damus.io", "wss://nos.lol"]);
  expect(defaultRelaysFor("")).toEqual(["wss://relay.damus.io", "wss://nos.lol"]);
});

it("nostrism.relays の wss:// だけを重複なしで使い、無い・壊れている・空なら既定に戻す", () => {
  expect(
    relayListFrom(
      JSON.stringify(["wss://a.example", "ws://b.example", 1, "wss://a.example", "wss://"]),
      "ja",
    ),
  ).toEqual(["wss://a.example"]);
  expect(relayListFrom(null, "en")).toEqual(defaultRelaysFor("en"));
  expect(relayListFrom("{broken", "ja")).toEqual(defaultRelaysFor("ja"));
  expect(relayListFrom("[]", "ja")).toEqual(defaultRelaysFor("ja"));
});

describe("リレー集合", () => {
  afterEach(() => {
    localStorage.clear();
    resetRelays();
  });

  it("起動時は nostrism.relays を read / write の両方に使い、無ければ言語別の既定", () => {
    expect(initialRelaySet(JSON.stringify(["wss://saved.example"]), "ja")).toEqual({
      read: ["wss://saved.example"],
      write: ["wss://saved.example"],
      source: "saved",
    });
    expect(initialRelaySet(null, "ja")).toEqual({
      read: defaultRelaysFor("ja"),
      write: defaultRelaysFor("ja"),
      source: "default",
    });
  });

  it("kind:10002 の read / write を分け、片側が空ならその側は既定、両側とも空なら null", () => {
    expect(
      relaySetFromPrefs(
        [
          { url: "wss://both/", read: true, write: true },
          { url: "wss://r/", read: true, write: false },
          { url: "wss://w/", read: false, write: true },
        ],
        "en",
      ),
    ).toEqual({ read: ["wss://both/", "wss://r/"], write: ["wss://both/", "wss://w/"], source: "nip65" });
    expect(relaySetFromPrefs([{ url: "wss://w/", read: false, write: true }], "en")).toEqual({
      read: defaultRelaysFor("en"),
      write: ["wss://w/"],
      source: "nip65",
    });
    expect(relaySetFromPrefs([], "en")).toBeNull();
  });

  it("applyRelayPrefs は nostrism.relays があるときは使わない（保存値が優先）", () => {
    localStorage.setItem(RELAYS_KEY, JSON.stringify(["wss://saved.example"]));
    resetRelays();
    applyRelayPrefs([{ url: "wss://nip65/", read: true, write: true }]);
    expect(useRelays.getState()).toMatchObject({ read: ["wss://saved.example"], source: "saved" });

    localStorage.clear();
    resetRelays();
    applyRelayPrefs([{ url: "wss://nip65/", read: true, write: true }]);
    expect(useRelays.getState()).toEqual({
      read: ["wss://nip65/"],
      write: ["wss://nip65/"],
      source: "nip65",
    });
  });
});
