import { normalizeURL } from "applesauce-core/helpers/url";
import { afterEach, describe, expect, it } from "vitest";
import {
  addRelay,
  applyOwnRelayList,
  applySinceForResend,
  connectedRelayUrls,
  defaultRelaysFor,
  FUTURE_SKEW_SEC,
  initialRelaySet,
  loadRelayTable,
  needsAuthForPublish,
  pool,
  RELAYS_KEY,
  recordReceived,
  relayListFrom,
  relayRows,
  removeRelay,
  resetRelays,
  setRelayReadWrite,
  unloadRelayTable,
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

  it("kind:1059 を含むフィルタには since を付けない（ほかのフィルタには付ける）", () => {
    const giftWrap = { kinds: [1059], "#p": ["me"] };
    const mixed = { kinds: [4, 1059], "#p": ["me"] };
    const out = applySinceForResend([giftWrap, mixed, stream], 1_000_000, 60);
    expect(out[0]).toEqual({ kinds: [1059], "#p": ["me"] });
    expect(out[1]).toEqual({ kinds: [4, 1059], "#p": ["me"] });
    expect(out[2]).toEqual({ kinds: [1], limit: 100, since: 999_940 });
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

  it("起動時は nostrism.relays を read / write の両方に使い（手動扱い）、無ければ言語別の既定", () => {
    expect(initialRelaySet(JSON.stringify(["wss://saved.example"]), "ja")).toEqual({
      read: ["wss://saved.example"],
      write: ["wss://saved.example"],
      source: "manual",
    });
    expect(initialRelaySet(null, "ja")).toEqual({
      read: defaultRelaysFor("ja"),
      write: defaultRelaysFor("ja"),
      source: "default",
    });
  });
});

// #585: 追加・削除・Read/Write の切替を接続先へ即反映し、優先順位は NIP-65 → 手動 → 既定
describe("自分のリレー表（loadRelayTable / addRelay / removeRelay / setRelayReadWrite / applyOwnRelayList）", () => {
  const DEFAULTS = defaultRelaysFor(navigator.language ?? "");

  afterEach(() => {
    localStorage.clear();
    resetRelays();
    unloadRelayTable();
  });

  it("初めてのアカウントは言語別の既定を種にでき、接続先（useRelays）へ即反映する", () => {
    loadRelayTable("me1");
    const normalized = DEFAULTS.map((url) => normalizeURL(url));
    expect(relayRows()).toEqual(
      normalized.map((url) => ({ url, read: true, write: true, source: "default" })),
    );
    expect(useRelays.getState()).toEqual({ read: normalized, write: normalized, source: "default" });
  });

  it("nostrism.relays（旧版の全端末共通の保存値）があれば、初回だけ手動リレーへ引き継ぐ（#585 挙動1.8）", () => {
    localStorage.setItem(RELAYS_KEY, JSON.stringify(["wss://legacy.example"]));
    loadRelayTable("me1");
    expect(relayRows()).toEqual([
      { url: "wss://legacy.example/", read: true, write: true, source: "manual" },
    ]);

    // 2 度目の読み込みでは（旧版の値を消していなくても）アカウントに保存済みの表をそのまま使う
    removeRelay("wss://legacy.example/");
    loadRelayTable("me1");
    expect(relayRows()).toEqual([]);
  });

  it("addRelay は接続先へ即反映し（保存前）、setRelayReadWrite / removeRelay も同様", () => {
    loadRelayTable("me1");
    addRelay("wss://new.example");
    expect(relayRows()).toContainEqual({
      url: "wss://new.example/",
      read: true,
      write: true,
      source: "manual",
    });
    expect(useRelays.getState().read).toContain("wss://new.example/");
    expect(useRelays.getState().write).toContain("wss://new.example/");

    setRelayReadWrite("wss://new.example/", true, false);
    expect(useRelays.getState().write).not.toContain("wss://new.example/");
    expect(relayRows()).toContainEqual({
      url: "wss://new.example/",
      read: true,
      write: false,
      source: "manual",
    });

    removeRelay("wss://new.example/");
    expect(useRelays.getState().read).not.toContain("wss://new.example/");
    expect(relayRows().some((r) => r.url === "wss://new.example/")).toBe(false);
  });

  it("手動リレーはアカウントごとに持ち、ログアウト・別アカウントで混ざらない", () => {
    loadRelayTable("me1");
    addRelay("wss://mine.example");
    unloadRelayTable();
    expect(useRelays.getState()).toEqual({ read: DEFAULTS, write: DEFAULTS, source: "default" });

    loadRelayTable("me2");
    expect(relayRows().some((r) => r.url === "wss://mine.example/")).toBe(false);

    loadRelayTable("me1");
    expect(relayRows()).toContainEqual({
      url: "wss://mine.example/",
      read: true,
      write: true,
      source: "manual",
    });
  });

  it("applyOwnRelayList は同じ url で NIP-65 が手動・既定より勝ち、read のあるリレーが来たら既定を外す", () => {
    loadRelayTable("me1");
    addRelay("wss://manual-only.example");
    applyOwnRelayList("me1", [
      { url: "wss://manual-only.example/", read: false, write: true },
      { url: "wss://nip65-only.example/", read: true, write: true },
    ]);
    expect(relayRows()).toEqual(
      expect.arrayContaining([
        { url: "wss://manual-only.example/", read: false, write: true, source: "nip65" },
        { url: "wss://nip65-only.example/", read: true, write: true, source: "nip65" },
      ]),
    );
    // read できるリレーが来たので既定は外れている
    expect(relayRows().some((r) => r.source === "default")).toBe(false);
    expect(useRelays.getState()).toEqual({
      read: ["wss://nip65-only.example/"],
      write: ["wss://manual-only.example/", "wss://nip65-only.example/"],
      source: "nip65",
    });
  });

  it("受信した NIP-65 に含まれない手動追加は消えない（ネイティブ applyRelayList の合成規則）", () => {
    loadRelayTable("me1");
    addRelay("wss://manual.example");
    applyOwnRelayList("me1", [{ url: "wss://nip65.example/", read: true, write: true }]);
    expect(relayRows()).toEqual(
      expect.arrayContaining([
        { url: "wss://manual.example/", read: true, write: true, source: "manual" },
        { url: "wss://nip65.example/", read: true, write: true, source: "nip65" },
      ]),
    );
    expect(useRelays.getState().read).toEqual(
      expect.arrayContaining(["wss://manual.example/", "wss://nip65.example/"]),
    );
  });
});

// 実際には繋がない（Relay のソケットは req/event を subscribe するまで開かない）。#582
describe("connectedRelayUrls / needsAuthForPublish", () => {
  afterEach(() => pool.close());

  it("connected$ が立っているリレーだけを返す。AUTH 要求も認証済みも無ければ false", () => {
    const relay = pool.relay("wss://relay.example");
    expect(connectedRelayUrls()).toEqual([]);
    expect(needsAuthForPublish("wss://relay.example")).toBe(false);

    relay.connected$.next(true);
    expect(connectedRelayUrls()).toEqual(["wss://relay.example/"]);
  });

  it("プールに無いリレーは false", () => {
    expect(needsAuthForPublish("wss://not-in-pool.example")).toBe(false);
  });
});
