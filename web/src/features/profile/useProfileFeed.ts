import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { useEffect, useMemo, useState } from "react";
import { map } from "rxjs";
import { INDEXER_RELAYS, LOADING_TIMEOUT_MS } from "../../lib/columnRequest";
import { extractMedia } from "../../lib/media";
import { authorOutbox$ } from "../../nostr/outbox";
import { relays, requestOnce, subscribeTo } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";

/** 開いている間に張る REQ の kind（プロフィール・投稿・リポスト・リレーリスト） */
export const PROFILE_REQ_KINDS = [0, 1, 6, 16, 10002];
/** 投稿タブに出す kind（返信も含む） */
export const PROFILE_FEED_KINDS = [1, 6, 16];
export const PROFILE_REQ_LIMIT = 100;
/** 投稿タブの最大件数（ネイティブ feedAuthorsWithReposts の LIMIT 150。過去読みは無い） */
export const PROFILE_FEED_MAX = 150;
/** 開いた時の kind:0 / 10002 の取り直しを待つ時間 */
export const PROFILE_OPEN_TIMEOUT_MS = 10_000;

const NO_EVENTS: NostrEvent[] = [];

/** メディアタブに出すか（kind:1 は画像あり、リポストは手元にある元投稿が画像ありの kind:1） */
export function hasProfileMedia(event: NostrEvent): boolean {
  if (event.kind === 1) return extractMedia(event).images.length > 0;
  if (event.kind === 6 || event.kind === 16) {
    const id = event.tags.find((t) => t[0] === "e")?.[1];
    if (!id) return false;
    const original = eventStore.getEvent(id);
    return original?.kind === 1 && extractMedia(original).images.length > 0;
  }
  return false;
}

/**
 * プロフィール画面の購読と投稿（ネイティブ ProfileScreen の subscribeColumn + loadProfile）。
 * 開いている間、本人の kind 0/1/6/16/10002 を自分のリレーと本人の書き込みリレー（アウトボックス）へ張り、
 * 開いた時に kind:0 / 10002 をインデクサと nprofile のリレーヒントからも取り直す。閉じたら CLOSE。
 */
export function useProfileFeed(
  pubkey: string,
  relayHints: readonly string[],
): { loading: boolean; posts: NostrEvent[]; media: NostrEvent[] } {
  const hintsKey = relayHints
    .filter((url) => url.startsWith("wss://"))
    .slice(0, 3)
    .join(",");

  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const main = [{ kinds: PROFILE_REQ_KINDS, authors: [pubkey], limit: PROFILE_REQ_LIMIT }];
    const hints = hintsKey === "" ? [] : hintsKey.split(",");
    setLoading(true);
    const done = () => setLoading(false);
    const timer = setTimeout(done, LOADING_TIMEOUT_MS);
    const feed = subscribeTo(relays, main).subscribe(done);
    const outbox = authorOutbox$([pubkey], main).subscribe();
    const reload = requestOnce(
      [...new Set([...relays, ...INDEXER_RELAYS, ...hints])],
      [{ kinds: [0, 10002], authors: [pubkey], limit: 4 }],
      PROFILE_OPEN_TIMEOUT_MS,
    ).subscribe({ error: () => {} });
    return () => {
      clearTimeout(timer);
      feed.unsubscribe();
      outbox.unsubscribe();
      reload.unsubscribe();
    };
  }, [pubkey, hintsKey]);

  const posts =
    use$(
      () =>
        eventStore
          .timeline({ kinds: PROFILE_FEED_KINDS, authors: [pubkey] })
          .pipe(map((list) => list.slice(0, PROFILE_FEED_MAX))),
      [pubkey],
    ) ?? NO_EVENTS;
  const media = useMemo(() => posts.filter(hasProfileMedia), [posts]);
  return { loading, posts, media };
}
