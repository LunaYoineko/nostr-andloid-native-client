import { getOutboxes } from "applesauce-core/helpers/mailboxes";
import { getSeenRelays } from "applesauce-core/helpers/relays";
import type { NostrEvent } from "nostr-tools/pure";
import { SEARCH_RELAYS } from "../../lib/columnRequest";
import { writeRelays } from "../../nostr/pool";
import { authRequestedRelays } from "../../nostr/relayAuth";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { normalizeRelayUrl, pickRelayHint } from "./tags";

export type RelayHintLookup = { eventHint(id: string): string; pubkeyHint(pk: string): string };

/**
 * ストアから引くリレーヒント（ネイティブ EventRepository.withRelayHints の Web 版）。
 * 受信元はストアの記録、著者の write はストアの kind:10002（自分は write リレー）。
 * 検索専用リレーと、AUTH を要求済みのリレーは除く（挙動1.7）。
 */
export function storeRelayHints(me: string | null): RelayHintLookup {
  // AUTH を要求済みのリレーも除く（挙動1.7。relayAuth.ts は applesauce の normalizeURL で正規化しているので、
  // ここでの比較用に normalizeRelayUrl へ通し直す）
  const excluded = new Set([
    ...SEARCH_RELAYS.map(normalizeRelayUrl),
    ...[...authRequestedRelays()].map(normalizeRelayUrl),
  ]);
  const writeOf = (pk: string): string[] => {
    if (pk === me) return writeRelays().map(normalizeRelayUrl);
    const list = eventStore.getReplaceable(10002, pk);
    return list ? getOutboxes(list).map(normalizeRelayUrl) : [];
  };
  const seenOn = (event: NostrEvent | undefined): string[] =>
    event ? [...(getSeenRelays(event) ?? [])].map(normalizeRelayUrl) : [];
  return {
    eventHint(id) {
      const event = eventStore.getEvent(id);
      return pickRelayHint(seenOn(event), event ? writeOf(event.pubkey) : [], excluded);
    },
    // ネイティブの「その人を最後に見たリレー」の代わりに kind:0 の受信元を使う
    pubkeyHint(pk) {
      return pickRelayHint(seenOn(eventStore.getReplaceable(0, pk)), writeOf(pk), excluded);
    },
  };
}

/** 投稿 id のリレーヒント（nevent 用、#459） */
export function relayHintForEvent(id: string): string {
  return storeRelayHints(useSession.getState().pubkey).eventHint(id);
}
