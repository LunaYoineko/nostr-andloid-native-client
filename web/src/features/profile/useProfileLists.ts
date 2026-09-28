import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { useEffect, useMemo, useState } from "react";
import { INDEXER_RELAYS, LOADING_TIMEOUT_MS } from "../../lib/columnRequest";
import { requestOnce, useReadRelays } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { NIP51_SET_KINDS, type Nip51Set, parseNip51Sets } from "./nip51";

const NO_EVENTS: NostrEvent[] = [];

/**
 * 本人の NIP-51 セット（フォローセット kind:30000 / ブックマークセット kind:30003。リストタブ）。
 * 開いている間に authors:[pubkey] で 1 度だけ取りに行く（自分のリレーとインデクサ。EOSE か 8 秒で読み込み中を消す）。
 * サイズは小さいので EventStore へ入れて構わない（フォロワー集計の kind:3 とは違う）。
 */
export function useProfileLists(pubkey: string): { loading: boolean; sets: Nip51Set[] } {
  const relays = useReadRelays();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const done = () => setLoading(false);
    const sub = requestOnce(
      [...new Set([...relays, ...INDEXER_RELAYS])],
      [{ kinds: [...NIP51_SET_KINDS], authors: [pubkey] }],
      LOADING_TIMEOUT_MS,
    ).subscribe({ complete: done, error: done });
    return () => sub.unsubscribe();
  }, [pubkey, relays]);

  const events =
    use$(() => eventStore.timeline({ kinds: [...NIP51_SET_KINDS], authors: [pubkey] }), [pubkey]) ??
    NO_EVENTS;
  const sets = useMemo(() => parseNip51Sets(events), [events]);
  return { loading, sets };
}
