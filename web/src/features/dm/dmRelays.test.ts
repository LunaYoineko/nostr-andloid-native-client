import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { dmRelaysFromEvent } from "./dmRelays";

it("relay タグの wss:// だけを正規化して重複なしで返す（ws:// と壊れた URL は捨てる）", () => {
  const event = finalizeEvent(
    {
      kind: 10050,
      created_at: 1,
      tags: [
        ["relay", "wss://dm.example"],
        ["relay", "wss://DM.example/"],
        ["relay", "ws://insecure.example"],
        ["relay", "wss://"],
        ["relay"],
        ["r", "wss://other.example"],
        ["relay", "wss://inbox.example/path"],
      ],
      content: "",
    },
    generateSecretKey(),
  );
  expect(dmRelaysFromEvent(event)).toEqual(["wss://dm.example/", "wss://inbox.example/path"]);
});
