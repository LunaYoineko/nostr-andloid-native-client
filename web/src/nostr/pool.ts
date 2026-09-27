import type { Filter } from "applesauce-core/helpers/filter";
import { normalizeURL } from "applesauce-core/helpers/url";
import { use$ } from "applesauce-react/hooks/use-$";
import { RelayPool } from "applesauce-relay/pool";
import type { NostrEvent } from "nostr-tools/pure";
import { filter, map, type Observable, tap, timer } from "rxjs";
import { eventStore } from "./store";

/** 接続するリレー一覧（JSON の文字列配列）。無ければ端末の言語で既定を選ぶ */
export const RELAYS_KEY = "nostrism.relays";

/** 既定リレー（ネイティブの DefaultRelays.kt の defaultRelaysFor と同じ） */
export function defaultRelaysFor(language: string): string[] {
  if (language.toLowerCase().slice(0, 2) === "ja") {
    return [
      "wss://relay-jp.shino3.net", // 日本向け（本アプリ運営）
      "wss://yabu.me", // 日本の大手フリーリレー
      "wss://relay.damus.io", // グローバル
      "wss://nos.lol", // グローバル
    ];
  }
  return ["wss://relay.damus.io", "wss://nos.lol"];
}

/**
 * 保存値（nostrism.relays の生文字列）からリレー一覧を決める。
 * 壊れている・wss:// の URL が 1 つも無い場合は言語別の既定に戻す。
 */
export function relayListFrom(saved: string | null, language: string): string[] {
  try {
    const value: unknown = saved ? JSON.parse(saved) : null;
    if (Array.isArray(value)) {
      const urls = value.filter((v): v is string => typeof v === "string" && isRelayUrl(v));
      if (urls.length > 0) return [...new Set(urls)];
    }
  } catch {
    // 壊れた保存値は既定へ
  }
  return defaultRelaysFor(language);
}

function isRelayUrl(value: string): boolean {
  if (!value.startsWith("wss://")) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function readSavedRelays(): string | null {
  try {
    return localStorage.getItem(RELAYS_KEY);
  } catch {
    return null;
  }
}

/** このセッションで使うリレー（起動時に 1 度だけ決める） */
export const relays: readonly string[] = relayListFrom(readSavedRelays(), navigator.language ?? "");

/** アプリで 1 つのリレープール。再接続のバックオフと再購読は applesauce に任せる */
export const pool = new RelayPool();

/**
 * 購読の再接続設定。applesauce の既定は 3 回で諦めるため、回線が戻るまで繰り返す
 * （間隔は 1 秒ずつ延ばし 30 秒で頭打ち。つながれば回数はリセット）。
 */
const RECONNECT = {
  count: Number.POSITIVE_INFINITY,
  delay: (_error: unknown, attempt: number) => timer(Math.min(attempt, 30) * 1000),
  resetOnSuccess: true,
};

/**
 * 全リレーへ REQ を張ったままにし、受けたイベントを EventStore へ入れる。
 * 戻り値はリレーごとの EOSE を流す（購読をやめると CLOSE を送る）。
 */
export function subscribe(filters: Filter | Filter[]): Observable<"EOSE"> {
  return pool.req([...relays], filters, { reconnect: RECONNECT }).pipe(
    tap((message) => {
      if (message.type === "EVENT") eventStore.add(message.event, message.from);
    }),
    filter((message) => message.type === "EOSE"),
    map(() => "EOSE" as const),
  );
}

/**
 * 指定リレーへ REQ を張ったままにする（カラムごとの購読）。受けたイベントは EventStore へ入れる。
 * 戻り値はリレーごとの EOSE を流す（購読をやめると CLOSE を送る）。
 */
export function subscribeTo(relays: readonly string[], filters: Filter[]): Observable<"EOSE"> {
  return pool.req([...relays], filters, { reconnect: RECONNECT }).pipe(
    tap((message) => {
      if (message.type === "EVENT") eventStore.add(message.event, message.from);
    }),
    filter((message) => message.type === "EOSE"),
    map(() => "EOSE" as const),
  );
}

/** 1 回だけ取りに行く（EOSE か timeoutMs で終わる）。受けたイベントは EventStore へ入れる */
export function requestOnce(
  relays: readonly string[],
  filters: Filter[],
  timeoutMs: number,
): Observable<NostrEvent> {
  return pool.request([...relays], filters, { timeout: timeoutMs }).pipe(tap((e) => eventStore.add(e)));
}

/**
 * 1 回だけ取りに行く（EOSE か timeoutMs で終わる）。requestOnce と違い EventStore に入れない
 * （他人の kind:3 など、保存したくない大きいイベント用。署名の検証は呼び出し側で行う）。
 */
export function requestOnceUnstored(
  relays: readonly string[],
  filters: Filter[],
  timeoutMs: number,
): Observable<NostrEvent> {
  return pool.request([...relays], filters, { timeout: timeoutMs });
}

export type RelayConnections = { connected: number; total: number };

const relayKeys = new Set(relays.map((url) => normalizeURL(url)));

/** 設定リレーのうち WebSocket が開いている数（プールにはリレーヒント由来の接続も入るので数えない） */
export const connections$: Observable<RelayConnections> = pool.status$.pipe(
  map((statuses) => ({
    connected: Object.values(statuses).filter((s) => s.connected && relayKeys.has(s.url)).length,
    total: relays.length,
  })),
);

/** ヘッダの「接続 N/M」用 */
export function useRelayConnections(): RelayConnections {
  return use$(connections$) ?? { connected: 0, total: relays.length };
}
