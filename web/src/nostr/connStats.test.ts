import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import type { Subscription } from "rxjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScriptedWebSocket } from "../test/scriptedWebSocket";
import {
  connMonitorSnapshot,
  formatChars,
  networkTier,
  readRelayStates,
  resetConnStats,
  startConnStats,
} from "./connStats";
import { resetRelays, subscribeTo, useRelays } from "./pool";

let subscription: Subscription | undefined;
let stop: (() => void) | undefined;

beforeEach(() => {
  vi.stubGlobal("WebSocket", ScriptedWebSocket);
  resetConnStats();
});

afterEach(() => {
  subscription?.unsubscribe();
  subscription = undefined;
  stop?.();
  stop = undefined;
  resetRelays();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "connection");
});

it("受信した EVENT の数と受信メッセージの文字数をリレーごとに数え、状態と購読中の REQ 数を出す", () => {
  const url = "wss://stats.example/";
  stop = startConnStats();
  useRelays.setState({ read: [url], write: [], source: "nip65" });
  subscription = subscribeTo([url], [{ kinds: [1], limit: 10 }]).subscribe();
  const socket = ScriptedWebSocket.latest(url);
  if (!socket) throw new Error("no socket");

  // 開く前は購読（REQ）を持っているので「接続中」
  expect(readRelayStates()).toEqual([{ url, state: "connecting" }]);

  socket.accept();
  const [req] = socket.reqs();
  const event = finalizeEvent({ kind: 1, created_at: 1_000, tags: [], content: "hi" }, generateSecretKey());
  socket.push(["EVENT", req.id, event]);
  socket.push(["EOSE", req.id]);

  const row = connMonitorSnapshot().relays.find((r) => r.url === url);
  expect(row).toMatchObject({ state: "connected", read: true, write: false, events: 1, reqs: 1 });
  expect(row?.chars).toBe(
    JSON.stringify(["EVENT", req.id, event]).length + JSON.stringify(["EOSE", req.id]).length,
  );
  expect(connMonitorSnapshot().reqs).toBeGreaterThanOrEqual(1);
  expect(readRelayStates()).toEqual([{ url, state: "connected" }]);
});

it("formatChars は B / KB / MB / GB に丸める（ネイティブ formatBytes と同じ）", () => {
  expect(formatChars(78)).toBe("78B");
  expect(formatChars(345 * 1024 + 10)).toBe("345KB");
  expect(formatChars(1.25 * 1024 * 1024)).toBe("1.2MB");
  expect(formatChars(3 * 1024 * 1024 * 1024)).toBe("3GB");
});

it("networkTier は navigator.connection が無い・種類が分からなければ null", () => {
  expect(networkTier()).toBeNull();
  const connection: { type?: string; saveData?: boolean } = {};
  Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
  expect(networkTier()).toBeNull();
  connection.type = "wifi";
  expect(networkTier()).toBe("unmetered");
  connection.type = "cellular";
  expect(networkTier()).toBe("metered");
  connection.saveData = true;
  expect(networkTier()).toBe("constrained");
  connection.type = "none";
  expect(networkTier()).toBe("offline");
});
