import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { useMemo } from "react";
import { eventStore } from "../../nostr/store";

const NO_EVENTS: NostrEvent[] = [];

/**
 * ids の順に EventStore から投稿を解決する（未取得の id はスキップ。ネイティブ EventRepository.kt notesByIds）。
 * ブックマーク一覧・固定投稿の表示に使う（created_at 順ではなく、渡した ids の順）。
 */
export function useNotesByIds(ids: readonly string[]): NostrEvent[] {
  const key = ids.join(",");
  const found =
    use$(() => eventStore.timeline(ids.length > 0 ? [{ ids: [...ids] }] : []), [key]) ?? NO_EVENTS;
  return useMemo(() => {
    if (ids.length === 0) return NO_EVENTS;
    const byId = new Map(found.map((e) => [e.id, e] as const));
    const resolved: NostrEvent[] = [];
    for (const id of ids) {
      const event = byId.get(id);
      if (event) resolved.push(event);
    }
    return resolved;
  }, [ids, found]);
}
