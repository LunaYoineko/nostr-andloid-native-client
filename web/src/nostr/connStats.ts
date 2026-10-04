import { normalizeURL } from "applesauce-core/helpers/url";
import type { Relay } from "applesauce-relay/relay";
import { useEffect, useState } from "react";
import { Subscription } from "rxjs";
import { t } from "../i18n";
import { pool, readRelays, writeRelays } from "./pool";

/**
 * リレーの接続状態と受信量（ネイティブ ConnectionMonitorDialog / RelayStatusDialog の元データ）。
 * 受信量はセッション内の累計（永続化しない）。受信メッセージを JSON に戻した文字数の合計で数える（概算）。
 */

/** 接続 = WebSocket が開いている / 接続中 = 開いていないが購読（REQ）を持っている（再接続待ち） / 切断 = それ以外 */
export type RelayConnState = "connected" | "connecting" | "disconnected";

// 参照するたびに辞書を引く（言語の変更が次の描画で効く）
export const RELAY_STATE_LABEL: Record<RelayConnState, string> = {
  get connected() {
    return t("relay_state_connected");
  },
  get connecting() {
    return t("relay_state_connecting");
  },
  get disconnected() {
    return t("relay_state_disconnected");
  },
};

type Traffic = { events: number; chars: number };

/** リレー（正規化した URL）ごとの受信の累計 */
const traffic = new Map<string, Traffic>();

function messageChars(message: unknown): number {
  try {
    return JSON.stringify(message)?.length ?? 0;
  } catch {
    return 0;
  }
}

function record(url: string, message: unknown): void {
  const t = traffic.get(url) ?? { events: 0, chars: 0 };
  t.chars += messageChars(message);
  if (Array.isArray(message) && message[0] === "EVENT") t.events += 1;
  traffic.set(url, t);
}

/**
 * 受信の計測を始める（起動時に 1 度）。プールにあるリレーと後から入ったリレーの受信メッセージを数える
 * （message$ は受け身なので、購読しても接続はしない）。戻り値は止める関数。
 */
export function startConnStats(): () => void {
  const subscription = new Subscription();
  const watch = (relay: Relay) => {
    subscription.add(relay.message$.subscribe((message) => record(relay.url, message)));
  };
  for (const relay of pool.relays.values()) watch(relay);
  subscription.add(pool.add$.subscribe(watch));
  return () => subscription.unsubscribe();
}

/** テスト用: 受信の累計を消す */
export function resetConnStats(): void {
  traffic.clear();
}

function reqCountOf(relay: Relay | undefined): number {
  return relay ? Object.keys(relay.reqs).length : 0;
}

function stateOf(relay: Relay | undefined): RelayConnState {
  if (relay?.connected) return "connected";
  return reqCountOf(relay) > 0 ? "connecting" : "disconnected";
}

function normalize(url: string): string {
  try {
    return normalizeURL(url);
  } catch {
    return url;
  }
}

export type RelayStateRow = { url: string; state: RelayConnState };

/** read リレー（ヘッダの「接続 N/M」と同じ集合）の接続状態。URL 順 */
export function readRelayStates(): RelayStateRow[] {
  return [...new Set(readRelays().map(normalize))]
    .sort()
    .map((url) => ({ url, state: stateOf(pool.relays.get(url)) }));
}

export type RelayMonitorRow = {
  url: string;
  state: RelayConnState;
  authenticated: boolean;
  read: boolean;
  write: boolean;
  /** 受信した EVENT の数 */
  events: number;
  /** 受信メッセージの文字数の合計（概算の受信量） */
  chars: number;
  /** 購読中の REQ の数 */
  reqs: number;
};

export type ConnMonitorSnapshot = { relays: RelayMonitorRow[]; reqs: number };

/**
 * 接続と通信量の一覧（プールのリレー（リレーヒント由来も含む）と read / write リレー）。受信量の多い順、同じなら URL 順
 */
export function connMonitorSnapshot(): ConnMonitorSnapshot {
  const readSet = new Set(readRelays().map(normalize));
  const writeSet = new Set(writeRelays().map(normalize));
  const urls = [...new Set([...pool.relays.keys(), ...readSet, ...writeSet])];
  const relays = urls.map((url): RelayMonitorRow => {
    const relay = pool.relays.get(url);
    const t = traffic.get(url);
    return {
      url,
      state: stateOf(relay),
      authenticated: relay?.authenticated ?? false,
      read: readSet.has(url),
      write: writeSet.has(url),
      events: t?.events ?? 0,
      chars: t?.chars ?? 0,
      reqs: reqCountOf(relay),
    };
  });
  relays.sort((a, b) => b.chars - a.chars || a.url.localeCompare(b.url));
  return { relays, reqs: relays.reduce((sum, r) => sum + r.reqs, 0) };
}

/** 受信量の表示（1.2MB / 345KB / 78B。ネイティブ formatBytes と同じ丸め。1 文字 = 1 バイトとみなす） */
export function formatChars(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${Math.floor((n * 10) / (1024 * 1024 * 1024)) / 10}GB`;
  if (n >= 1024 * 1024) return `${Math.floor((n * 10) / (1024 * 1024)) / 10}MB`;
  if (n >= 1024) return `${Math.floor(n / 1024)}KB`;
  return `${n}B`;
}

/** 回線の区分（ネイティブ NetworkTier） */
export type NetworkTier = "unmetered" | "metered" | "constrained" | "offline";

// 参照するたびに辞書を引く（言語の変更が次の描画で効く）
export const NETWORK_TIER_LABEL: Record<NetworkTier, string> = {
  get unmetered() {
    return t("conn_tier_unmetered");
  },
  get metered() {
    return t("conn_tier_metered");
  },
  get constrained() {
    return t("conn_tier_constrained");
  },
  get offline() {
    return t("conn_tier_offline");
  },
};

type NetworkInformationLike = { type?: string; saveData?: boolean };

/**
 * 今の回線（navigator.connection から）。navigator.connection が無い（Chromium 系以外）・回線の種類が
 * 分からない（デスクトップの Chromium は type を持たない）なら null
 */
export function networkTier(): NetworkTier | null {
  // navigator.connection は Chromium 系のみ（lib.dom に型が無い）
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!connection) return null;
  if (navigator.onLine === false || connection.type === "none") return "offline";
  if (connection.saveData === true) return "constrained";
  if (connection.type === "cellular") return "metered";
  if (connection.type === "wifi" || connection.type === "ethernet" || connection.type === "wimax") {
    return "unmetered";
  }
  return null;
}

/** read() の値を intervalMs ごとに読み直す（ネイティブのモニタと同じ 1 秒間隔） */
export function usePolled<T>(read: () => T, intervalMs = 1_000): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const timer = setInterval(() => setValue(read()), intervalMs);
    return () => clearInterval(timer);
  }, [read, intervalMs]);
  return value;
}
