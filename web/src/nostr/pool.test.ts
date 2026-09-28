import { afterEach, describe, expect, it } from "vitest";
import {
  applyRelayPrefs,
  applySinceForResend,
  defaultRelaysFor,
  FUTURE_SKEW_SEC,
  initialRelaySet,
  RELAYS_KEY,
  recordReceived,
  relayListFrom,
  relaySetFromPrefs,
  resetRelays,
  useRelays,
} from "./pool";

// ネイティブ ApplySinceForResendTest.kt の移植
describe("再接続時の since 差分（applySinceForResend）", () => {
  const stream = { kinds: [1], limit: 100 };

  it("受信済みがあれば since をマージン付きで差し込む（limit は残す）", () => {
    expect(applySinceForResend([stream], 1_000_000, 60)).toEqual([
      { kinds: [1], limit: 100, since: 999_940 },
    ]);
    // 既定のマージンは 60 秒
    expect(applySinceForResend([stream], 1_000_000)).toEqual([{ kinds: [1], limit: 100, since: 999_940 }]);
  });

  it("受信記録が無ければ従来どおり全量", () => {
    const filters = [stream];
    expect(applySinceForResend(filters, undefined)).toBe(filters);
  });

  it("明示された since / until は上書きしない", () => {
    const pinned = { kinds: [1], since: 123 };
    const ranged = { kinds: [1], until: 456 };
    const out = applySinceForResend([pinned, ranged, stream], 1_000_000, 60);
    expect(out[0]).toEqual({ kinds: [1], since: 123 });
    expect(out[1]).toEqual({ kinds: [1], until: 456 });
    expect(out[2].since).toBe(999_940);
  });

  it("マージンが受信時刻を上回っても負にならない", () => {
    expect(applySinceForResend([stream], 30, 60)[0].since).toBe(0);
  });

  it("最終受信は最大の created_at。今より FUTURE_SKEW_SEC を超えて未来のものは基準にしない", () => {
    const now = 1_000_000;
    const lastAt = new Map<string, number>();
    recordReceived(lastAt, "wss://a/", now - 10, now);
    recordReceived(lastAt, "wss://a/", now - 50, now);
    recordReceived(lastAt, "wss://a/", now + FUTURE_SKEW_SEC + 1, now);
    expect(lastAt.get("wss://a/")).toBe(now - 10);
    recordReceived(lastAt, "wss://a/", now + FUTURE_SKEW_SEC, now);
    expect(lastAt.get("wss://a/")).toBe(now + FUTURE_SKEW_SEC);
    expect(lastAt.has("wss://b/")).toBe(false);
  });
});

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
