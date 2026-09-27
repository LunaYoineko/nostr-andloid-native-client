import type { Filter } from "applesauce-core/helpers/filter";
import { normalizeURL } from "applesauce-core/helpers/url";
import { use$ } from "applesauce-react/hooks/use-$";
import { RelayPool } from "applesauce-relay/pool";
import type { NostrEvent } from "nostr-tools/pure";
import { combineLatest, distinctUntilChanged, filter, map, Observable, tap, timer } from "rxjs";
import { create } from "zustand";
import { addVerified } from "./store";

/** 接続するリレー一覧（JSON の文字列配列）。無ければ自分の kind:10002、それも無ければ端末の言語で既定を選ぶ */
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

/** 保存値（nostrism.relays の生文字列）の wss:// の URL（重複なし）。無い・壊れている・1 つも無いなら null */
export function savedRelayList(saved: string | null): string[] | null {
  try {
    const value: unknown = saved ? JSON.parse(saved) : null;
    if (Array.isArray(value)) {
      const urls = value.filter((v): v is string => typeof v === "string" && isRelayUrl(v));
      if (urls.length > 0) return [...new Set(urls)];
    }
  } catch {
    // 壊れた保存値は既定へ
  }
  return null;
}

/**
 * 保存値（nostrism.relays の生文字列）からリレー一覧を決める。
 * 壊れている・wss:// の URL が 1 つも無い場合は言語別の既定に戻す。
 */
export function relayListFrom(saved: string | null, language: string): string[] {
  return savedRelayList(saved) ?? defaultRelaysFor(language);
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

function browserLanguage(): string {
  return navigator.language ?? "";
}

/** この端末の言語の既定リレー */
export function defaultRelays(): string[] {
  return defaultRelaysFor(browserLanguage());
}

// ---- リレー集合（read = 購読・取得、write = 発行の送り先） ----

/** saved = nostrism.relays（最優先）、nip65 = 自分の kind:10002、default = 言語別の既定 */
export type RelaySource = "saved" | "nip65" | "default";

export type RelaySet = { read: readonly string[]; write: readonly string[]; source: RelaySource };

/** kind:10002 の r タグ 1 件ぶん（outbox.ts の RelayPref と同じ形） */
type RelayPrefLike = { url: string; read: boolean; write: boolean };

/** 起動時・ログアウト時のリレー集合。nostrism.relays があれば read / write の両方にそれを使い、無ければ既定 */
export function initialRelaySet(saved: string | null, language: string): RelaySet {
  const list = savedRelayList(saved);
  if (list) return { read: list, write: list, source: "saved" };
  const defaults = defaultRelaysFor(language);
  return { read: defaults, write: defaults, source: "default" };
}

/**
 * kind:10002 の読み書きから決めるリレー集合。片側が空ならその側は既定（つながる先・送り先を失わない）。
 * 両側とも空なら null（既定のまま）。
 */
export function relaySetFromPrefs(prefs: readonly RelayPrefLike[], language: string): RelaySet | null {
  const read = prefs.filter((p) => p.read).map((p) => p.url);
  const write = prefs.filter((p) => p.write).map((p) => p.url);
  if (read.length === 0 && write.length === 0) return null;
  const defaults = defaultRelaysFor(language);
  return {
    read: read.length > 0 ? read : defaults,
    write: write.length > 0 ? write : defaults,
    source: "nip65",
  };
}

/** このセッションで使うリレー集合。ログイン後に自分の kind:10002 で置き換わる（outbox.ts の followOwnRelayList） */
export const useRelays = create<RelaySet>()(() => initialRelaySet(readSavedRelays(), browserLanguage()));

/** 購読・取得に使うリレー */
export function readRelays(): readonly string[] {
  return useRelays.getState().read;
}

/** 発行の送り先 */
export function writeRelays(): readonly string[] {
  return useRelays.getState().write;
}

/** 購読・取得に使うリレー（変わったら描き直す） */
export function useReadRelays(): readonly string[] {
  return useRelays((s) => s.read);
}

/**
 * 自分の kind:10002 の読み書きをリレー集合にする。nostrism.relays があるときは使わない（保存値が優先）。
 * 読み書きが 1 つも無ければ何もしない（今のまま）。
 */
export function applyRelayPrefs(prefs: readonly RelayPrefLike[]): void {
  if (useRelays.getState().source === "saved") return;
  const next = relaySetFromPrefs(prefs, browserLanguage());
  if (next) useRelays.setState(next, true);
}

/** 起動時の集合（nostrism.relays か既定）へ戻す（ログアウト・アカウントの切り替え） */
export function resetRelays(): void {
  useRelays.setState(initialRelaySet(readSavedRelays(), browserLanguage()), true);
}

/** 購読・取得に使うリレーの変化（購読した時点の値から流す） */
export const readRelays$: Observable<string[]> = new Observable<readonly string[]>((subscriber) => {
  subscriber.next(useRelays.getState().read);
  return useRelays.subscribe((state) => subscriber.next(state.read));
}).pipe(
  distinctUntilChanged(),
  map((read) => [...read]),
);

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
 * read リレーすべてへ REQ を張ったままにし、受けたイベントを EventStore へ入れる。
 * read リレーが変わったら、増えたリレーへ張り、外れたリレーは CLOSE する（残ったリレーは張ったまま）。
 * 戻り値はリレーごとの EOSE を流す（購読をやめると CLOSE を送る）。
 */
export function subscribe(filters: Filter | Filter[]): Observable<"EOSE"> {
  return pool.req(readRelays$, filters, { reconnect: RECONNECT }).pipe(
    tap((message) => {
      if (message.type === "EVENT") addVerified(message.event, message.from);
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
      if (message.type === "EVENT") addVerified(message.event, message.from);
    }),
    filter((message) => message.type === "EOSE"),
    map(() => "EOSE" as const),
  );
}

/**
 * 指定リレー（変わったら張り替える）へ REQ を張ったままにし、受けたイベントと EOSE（リレーごと）を流す。
 * subscribe / subscribeTo と違い EventStore に入れず、署名も検証しない（DM の gift wrap / kind:4 用。
 * 検証は呼び出し側で verifyEvent）。購読をやめると CLOSE を送る。
 */
export function subscribeUnstored(
  relays: Observable<string[]>,
  filters: Filter[],
): Observable<NostrEvent | "EOSE"> {
  return pool.req(relays, filters, { reconnect: RECONNECT }).pipe(
    filter((message) => message.type === "EVENT" || message.type === "EOSE"),
    map((message) => (message.type === "EVENT" ? message.event : ("EOSE" as const))),
  );
}

/** 1 回だけ取りに行く（EOSE か timeoutMs で終わる）。受けたイベントは EventStore へ入れる */
export function requestOnce(
  relays: readonly string[],
  filters: Filter[],
  timeoutMs: number,
): Observable<NostrEvent> {
  return pool.request([...relays], filters, { timeout: timeoutMs }).pipe(tap((e) => addVerified(e)));
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

/** read リレーのうち WebSocket が開いている数（プールにはリレーヒント由来の接続も入るので数えない） */
export const connections$: Observable<RelayConnections> = combineLatest([pool.status$, readRelays$]).pipe(
  map(([statuses, read]) => {
    const keys = new Set(read.map((url) => normalizeURL(url)));
    return {
      connected: Object.values(statuses).filter((s) => s.connected && keys.has(s.url)).length,
      total: keys.size,
    };
  }),
);

/** ヘッダの「接続 N/M」用 */
export function useRelayConnections(): RelayConnections {
  const read = useReadRelays();
  return use$(connections$) ?? { connected: 0, total: read.length };
}
