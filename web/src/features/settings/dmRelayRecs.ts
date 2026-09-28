import type { NostrEvent } from "nostr-tools/pure";
import { catchError, concat, defer, EMPTY, ignoreElements, type Observable, of } from "rxjs";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { readRelays, requestOnce } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { dmRelaysFromEvent } from "../dm/dmRelays";
import { followsFromContacts } from "../profile/contacts";

/** 集計するフォローの人数（relayRecs.ts の RECS_FOLLOW_LIMIT・ネイティブ fetchDmRelayRecommendations と同じ） */
export const DMRELAY_RECS_FOLLOW_LIMIT = 300;
/** 候補の件数（ネイティブと同じ） */
export const DMRELAY_RECS_MAX = 12;
/** kind:3 / kind:10050 を取りに行って待つ最大時間（relayRecs.ts と同じ） */
export const DMRELAY_RECS_WAIT_MS = 3_500;

/** 候補 1 件（count = そのリレーを kind:10050 に入れているフォローの人数） */
export type DmRelayRec = { url: string; count: number };

/**
 * フォローの kind:10050 群 → 使っている人の多い順の候補（relayRecs.ts の aggregateRelayRecs と同じ考え方）。
 * 著者ごとに最新の 1 件だけ、1 人 1 票で数える。exclude（登録済み）は除く。同じ人数なら URL 順。
 */
export function aggregateDmRelayRecs(
  dmRelayLists: readonly NostrEvent[],
  exclude: ReadonlySet<string>,
  max = DMRELAY_RECS_MAX,
): DmRelayRec[] {
  const latest = new Map<string, NostrEvent>();
  for (const e of dmRelayLists) {
    if (e.kind !== 10050) continue;
    const prev = latest.get(e.pubkey);
    if (!prev || e.created_at > prev.created_at) latest.set(e.pubkey, e);
  }
  const counts = new Map<string, number>();
  for (const e of latest.values()) {
    for (const url of dmRelaysFromEvent(e)) counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  return [...counts]
    .filter(([url]) => !exclude.has(url))
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, max)
    .map(([url, count]) => ({ url, count }));
}

/** 1 回取りに行って EventStore へ入れる（届いた分だけで進める。どこからも届かなくても止めない） */
function fetchInto(filters: Parameters<typeof requestOnce>[1]): Observable<never> {
  return requestOnce([...new Set([...readRelays(), ...INDEXER_RELAYS])], filters, DMRELAY_RECS_WAIT_MS).pipe(
    ignoreElements(),
    catchError(() => EMPTY),
  );
}

/**
 * 自分のフォロー（先頭 DMRELAY_RECS_FOLLOW_LIMIT 人）の kind:10050 を read リレーとインデクサへ取りに行き、
 * 手元の分と合わせて集計した候補を 1 回流して終わる。自分の kind:3 が手元に無ければ先に取りに行く。
 * フォローがいなければ空。購読をやめると取得も CLOSE する。
 */
export function dmRelayRecs$(me: string, exclude: ReadonlySet<string>): Observable<DmRelayRec[]> {
  return defer(() => {
    const contacts$ = eventStore.getReplaceable(3, me)
      ? EMPTY
      : fetchInto([{ kinds: [3], authors: [me], limit: 1 }]);
    return concat(
      contacts$,
      defer(() => {
        const authors = followsFromContacts(eventStore.getReplaceable(3, me)).slice(
          0,
          DMRELAY_RECS_FOLLOW_LIMIT,
        );
        if (authors.length === 0) return of([]);
        return concat(
          fetchInto([{ kinds: [10050], authors }]),
          defer(() => {
            const lists = authors.flatMap((a) => eventStore.getReplaceable(10050, a) ?? []);
            return of(aggregateDmRelayRecs(lists, exclude));
          }),
        );
      }),
    );
  });
}
