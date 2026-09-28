import type { NostrEvent } from "nostr-tools/pure";
import { catchError, concat, defer, EMPTY, ignoreElements, type Observable, of } from "rxjs";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { relayPrefsFromEvent } from "../../nostr/outbox";
import { readRelays, requestOnce } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { followsFromContacts } from "../profile/contacts";

/** 集計するフォローの人数（ネイティブ fetchRelayRecommendations と同じ。REQ の肥大化を避ける） */
export const RECS_FOLLOW_LIMIT = 300;
/** 候補の件数 */
export const RECS_MAX = 12;
/** kind:3 / kind:10002 を取りに行って待つ最大時間（ネイティブは 3.5 秒待つ） */
export const RECS_WAIT_MS = 3_500;

/** 候補 1 件（count = そのリレーを kind:10002 に入れているフォローの人数） */
export type RelayRec = { url: string; count: number };

/**
 * フォローの kind:10002 群 → 使っている人の多い順の候補（ネイティブ fetchRelayRecommendations の集計）。
 * 著者ごとに最新の 1 件だけ、1 人 1 票で数える（read / write は問わない）。exclude（登録済み）は除く。
 * 同じ人数なら URL 順。
 */
export function aggregateRelayRecs(
  relayLists: readonly NostrEvent[],
  exclude: ReadonlySet<string>,
  max = RECS_MAX,
): RelayRec[] {
  const latest = new Map<string, NostrEvent>();
  for (const e of relayLists) {
    if (e.kind !== 10002) continue;
    const prev = latest.get(e.pubkey);
    if (!prev || e.created_at > prev.created_at) latest.set(e.pubkey, e);
  }
  const counts = new Map<string, number>();
  for (const e of latest.values()) {
    for (const p of relayPrefsFromEvent(e)) counts.set(p.url, (counts.get(p.url) ?? 0) + 1);
  }
  return [...counts]
    .filter(([url]) => !exclude.has(url))
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, max)
    .map(([url, count]) => ({ url, count }));
}

/** 1 回取りに行って EventStore へ入れる（届いた分だけで進める。どこからも届かなくても止めない） */
function fetchInto(filters: Parameters<typeof requestOnce>[1]): Observable<never> {
  return requestOnce([...new Set([...readRelays(), ...INDEXER_RELAYS])], filters, RECS_WAIT_MS).pipe(
    ignoreElements(),
    catchError(() => EMPTY),
  );
}

/**
 * 自分のフォロー（先頭 RECS_FOLLOW_LIMIT 人）の kind:10002 を read リレーとインデクサへ取りに行き、
 * 手元の分と合わせて集計した候補を 1 回流して終わる。自分の kind:3 が手元に無ければ先に取りに行く。
 * フォローがいなければ空。購読をやめると取得も CLOSE する。
 */
export function relayRecs$(me: string, exclude: ReadonlySet<string>): Observable<RelayRec[]> {
  return defer(() => {
    const contacts$ = eventStore.getReplaceable(3, me)
      ? EMPTY
      : fetchInto([{ kinds: [3], authors: [me], limit: 1 }]);
    return concat(
      contacts$,
      defer(() => {
        const authors = followsFromContacts(eventStore.getReplaceable(3, me)).slice(0, RECS_FOLLOW_LIMIT);
        if (authors.length === 0) return of([]);
        return concat(
          fetchInto([{ kinds: [10002], authors }]),
          defer(() => {
            const lists = authors.flatMap((a) => eventStore.getReplaceable(10002, a) ?? []);
            return of(aggregateRelayRecs(lists, exclude));
          }),
        );
      }),
    );
  });
}

export type RelayPresetCategory = "general" | "japan" | "paid";

/** 定番の候補 1 件（note = 「有料」などの補足） */
export type RelayPreset = { url: string; category: RelayPresetCategory; note?: "有料" | "検索対応" };

export const RELAY_PRESET_CATEGORY_LABEL: Record<RelayPresetCategory, string> = {
  general: "汎用",
  japan: "日本",
  paid: "ペイド",
};

/** 集計できないとき（フォローが無い等）の定番の候補（ネイティブ Presets.kt の RELAY_PRESETS と同じ順） */
export const RELAY_PRESETS: readonly RelayPreset[] = [
  // 汎用（無料・大手）
  { url: "wss://relay.damus.io", category: "general" },
  { url: "wss://nos.lol", category: "general" },
  { url: "wss://relay.primal.net", category: "general" },
  { url: "wss://relay.nostr.band", category: "general", note: "検索対応" },
  { url: "wss://relay.snort.social", category: "general" },
  { url: "wss://nostr.mom", category: "general" },
  { url: "wss://offchain.pub", category: "general" },
  { url: "wss://purplerelay.com", category: "general" },
  // 日本
  { url: "wss://relay-jp.nostr.wirednet.jp", category: "japan" },
  { url: "wss://yabu.me", category: "japan" },
  { url: "wss://r.kojira.io", category: "japan" },
  // ペイド（有料・認証必須のことが多い）
  { url: "wss://nostr.wine", category: "paid", note: "有料" },
  { url: "wss://eden.nostr.land", category: "paid", note: "有料" },
  { url: "wss://nostrelites.org", category: "paid", note: "有料" },
];
