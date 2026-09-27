import { expect, it } from "vitest";
import { defaultRelaysFor, relayListFrom } from "./pool";

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
