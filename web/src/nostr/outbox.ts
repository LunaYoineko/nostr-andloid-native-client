import type { Filter } from "applesauce-core/helpers/filter";
import { normalizeURL } from "applesauce-core/helpers/url";
import type { NostrEvent } from "nostr-tools/pure";
import { catchError, concat, defer, EMPTY, ignoreElements, type Observable } from "rxjs";
import { INDEXER_RELAYS, OUTBOX_MAX_AUTHORS } from "../lib/columnRequest";
import { relays, requestOnce, subscribeTo } from "./pool";
import { eventStore } from "./store";

/**
 * NIP-65（kind:10002）の読み書きリレーと、著者の書き込みリレーへの追加購読（アウトボックス）。
 * ネイティブの model/Nip65.kt と EventRepository の subscribeAuthorOutbox / authorWriteRelays の写し。
 */

/** kind:10002 の r タグ 1 件 */
export type RelayPref = { url: string; read: boolean; write: boolean };

/** 著者の kind:10002 が手元に無いとき、取りに行って待つ最大時間 */
export const OUTBOX_RELAYLIST_WAIT_MS = 10_000;

/**
 * kind:10002 の r タグ → リレーの読み書き（ネイティブ nip65PrefsFromTags）。
 * wss:// だけを正規化して使い、マーカー無しは read + write。同じ URL は最初のものを残す。
 */
export function relayPrefsFromEvent(event: NostrEvent): RelayPref[] {
  const prefs: RelayPref[] = [];
  const seen = new Set<string>();
  for (const t of event.tags) {
    if (t[0] !== "r" || t.length < 2 || typeof t[1] !== "string") continue;
    const raw = t[1].trim();
    if (!raw.startsWith("wss://")) continue;
    let url: string;
    try {
      url = normalizeURL(raw);
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const marker = t[2]?.trim().toLowerCase() || null;
    prefs.push({ url, read: marker !== "write", write: marker !== "read" });
  }
  return prefs;
}

/** 手元（EventStore）にある pubkey の kind:10002 の読み書きリレー。無ければ空 */
export function relayPrefsOf(pubkey: string): RelayPref[] {
  const event = eventStore.getReplaceable(10002, pubkey);
  return event ? relayPrefsFromEvent(event) : [];
}

/** pubkey の書き込みリレー（正規化済み URL） */
export function writeRelaysOf(pubkey: string): string[] {
  return relayPrefsOf(pubkey)
    .filter((p) => p.write)
    .map((p) => p.url);
}

/** nprofile に入れるリレーヒント（kind:10002 の先頭 max 件、末尾の / 無し。ネイティブ nip65RelaysOf） */
export function relayHintsOf(pubkey: string, max = 3): string[] {
  return relayPrefsOf(pubkey)
    .slice(0, max)
    .map((p) => p.url.replace(/\/$/, ""));
}

/** 表示用のリレー URL（先頭の wss:// と末尾の / を落とす） */
export function displayRelayUrl(url: string): string {
  return url.replace(/^wss:\/\//, "").replace(/\/$/, "");
}

/**
 * 著者（1〜3 人）の書き込みリレーのうち、自分が接続していないものへ filters の REQ を追加で張る
 * （ネイティブ subscribeAuthorOutbox）。書き込みリレーが分からない著者がいれば、先に kind:10002 を
 * インデクサと自分のリレーへ取りに行き（最大 10 秒）、届いた分で決める。
 * 購読をやめると、待機中の kind:10002 の取得も追加の REQ も CLOSE する。
 */
export function authorOutbox$(authors: readonly string[], filters: Filter[]): Observable<"EOSE"> {
  return defer(() => {
    if (authors.length === 0 || authors.length > OUTBOX_MAX_AUTHORS) return EMPTY;
    const needs = authors.filter((a) => writeRelaysOf(a).length === 0);
    const relayList$ =
      needs.length > 0
        ? requestOnce(
            [...new Set([...INDEXER_RELAYS, ...relays])],
            [{ kinds: [10002], authors: needs, limit: needs.length }],
            OUTBOX_RELAYLIST_WAIT_MS,
          ).pipe(
            ignoreElements(),
            // どこからも届かなくても、手元にある分で進める
            catchError(() => EMPTY),
          )
        : EMPTY;
    const outbox$ = defer(() => {
      const own = new Set(relays.map((url) => normalizeURL(url)));
      const targets = [...new Set(authors.flatMap(writeRelaysOf))].filter((url) => !own.has(url));
      return targets.length === 0 ? EMPTY : subscribeTo(targets, filters);
    });
    return concat(relayList$, outbox$);
  });
}
