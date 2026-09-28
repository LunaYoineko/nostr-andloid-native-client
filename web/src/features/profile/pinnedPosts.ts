import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { useEffect, useMemo } from "react";
import { subscribeTo, useReadRelays } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { parseEIdList } from "../lists/eidList";
import { useNotesByIds } from "../lists/notesByIds";

/**
 * pubkey の固定投稿（NIP-51 kind:10001）。誰のプロフィールでも同じように購読する
 * （ネイティブ EventRepository.kt pinnedNotesFor。自分のプロフィールでも特別扱いしない）。
 * 並びは e タグの出現順（ブックマークと違い逆順にしない。#531）。
 */
export function usePinnedPosts(pubkey: string): NostrEvent[] {
  const relays = useReadRelays();

  useEffect(() => {
    const sub = subscribeTo(relays, [{ kinds: [10001], authors: [pubkey], limit: 1 }]).subscribe();
    return () => sub.unsubscribe();
  }, [relays, pubkey]);

  const latest = use$(() => eventStore.replaceable({ kind: 10001, pubkey }), [pubkey]);
  const list = useMemo(() => parseEIdList(latest ?? null), [latest]);

  useEffect(() => {
    if (list.ids.length === 0) return;
    const sub = subscribeTo(relays, [{ ids: list.ids, limit: list.ids.length }]).subscribe();
    return () => sub.unsubscribe();
  }, [relays, list.ids]);

  return useNotesByIds(list.ids);
}
