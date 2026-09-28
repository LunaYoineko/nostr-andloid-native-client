import { verifyEvent } from "nostr-tools/pure";
import { useEffect, useState } from "react";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { readRelays, requestOnceUnstored } from "../../nostr/pool";
import { followsFromContacts } from "./contacts";

/** 他人のフォロー一覧を覚えておく人数（ネイティブも他人の kind:3 はメモリの LRU 8 件） */
export const CONTACTS_OF_CACHE_MAX = 8;
/** 相手の kind:3 を取りに行って CLOSE するまでの時間 */
export const CONTACTS_TIMEOUT_MS = 6_000;

type Entry = { createdAt: number; follows: string[] };

// 取り出し・更新で末尾へ回し、あふれたら先頭（最も古く使ったもの）を消す
const cache = new Map<string, Entry>();

function touch(pubkey: string): Entry | undefined {
  const entry = cache.get(pubkey);
  if (entry) {
    cache.delete(pubkey);
    cache.set(pubkey, entry);
  }
  return entry;
}

function store(pubkey: string, entry: Entry) {
  cache.delete(pubkey);
  cache.set(pubkey, entry);
  while (cache.size > CONTACTS_OF_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * 他人のフォロー（kind:3 の p タグ）。null = 未取得。
 * kind:3 は数千タグになる大きいイベントなので EventStore（と IndexedDB）には入れず、ここの LRU にだけ持つ。
 * 受けたイベントは署名を検証し、手元より新しいものだけで更新する。pubkey が null なら何もしない。
 */
export function useContactsOf(pubkey: string | null): string[] | null {
  const [result, setResult] = useState<{ pubkey: string; follows: string[] } | null>(() => {
    const entry = pubkey ? touch(pubkey) : undefined;
    return pubkey && entry ? { pubkey, follows: entry.follows } : null;
  });

  useEffect(() => {
    if (!pubkey) return;
    touch(pubkey);
    const sub = requestOnceUnstored(
      [...new Set([...readRelays(), ...INDEXER_RELAYS])],
      [{ kinds: [3], authors: [pubkey], limit: 1 }],
      CONTACTS_TIMEOUT_MS,
    ).subscribe({
      next: (event) => {
        if (event.kind !== 3 || event.pubkey !== pubkey || !verifyEvent(event)) return;
        const current = cache.get(pubkey);
        if (current && current.createdAt >= event.created_at) return;
        const entry = { createdAt: event.created_at, follows: followsFromContacts(event) };
        store(pubkey, entry);
        setResult({ pubkey, follows: entry.follows });
      },
      // どこからも届かなければ未取得のまま
      error: () => {},
    });
    return () => sub.unsubscribe();
  }, [pubkey]);

  if (!pubkey) return null;
  if (result?.pubkey === pubkey) return result.follows;
  return cache.get(pubkey)?.follows ?? null;
}
