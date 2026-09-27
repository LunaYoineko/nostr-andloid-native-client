import type { AddressPointer } from "applesauce-core/helpers/pointers";
import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { useMemo } from "react";
import { combineLatest, map, type Observable, of, switchMap } from "rxjs";
import { eventStore } from "../../nostr/store";

export type CustomEmoji = { shortcode: string; url: string };

/** kind:10030 が参照する絵文字セット（a タグの 30030:<pubkey>:<d>）。d は ":" を含んでよい */
export function emojiSetPointers(list?: NostrEvent): AddressPointer[] {
  if (!list) return [];
  const out: AddressPointer[] = [];
  for (const tag of list.tags) {
    if (tag[0] !== "a" || typeof tag[1] !== "string" || !tag[1].startsWith("30030:")) continue;
    const [, pubkey = "", ...rest] = tag[1].split(":");
    if (pubkey === "") continue;
    out.push({ kind: 30030, pubkey, identifier: rest.join(":") });
  }
  return out;
}

/**
 * 自分のカスタム絵文字（kind:10030 直下 → 参照するセットの順。同じ shortcode は先勝ち）を shortcode 昇順で。
 * 画像は https のみ（計画 6.3）。
 */
export function customEmojisFrom(
  list: NostrEvent | undefined,
  sets: readonly (NostrEvent | undefined)[],
): CustomEmoji[] {
  const byCode = new Map<string, string>();
  for (const event of [list, ...sets]) {
    if (!event) continue;
    for (const tag of event.tags) {
      if (tag[0] !== "emoji" || tag.length < 3) continue;
      const [, shortcode, url] = tag;
      if (shortcode.trim() === "" || !url.startsWith("https://") || byCode.has(shortcode)) continue;
      byCode.set(shortcode, url);
    }
  }
  return [...byCode]
    .map(([shortcode, url]) => ({ shortcode, url }))
    .sort((a, b) => (a.shortcode < b.shortcode ? -1 : a.shortcode > b.shortcode ? 1 : 0));
}

type EmojiSources = { list: NostrEvent | undefined; sets: (NostrEvent | undefined)[] };

/** 自分のカスタム絵文字（ストアに無ければローダが取りに行く） */
export function useCustomEmojis(me: string | null): CustomEmoji[] {
  const sources = use$((): Observable<EmojiSources> | undefined => {
    if (!me) return undefined;
    return eventStore.replaceable({ kind: 10030, pubkey: me }).pipe(
      switchMap((list) => {
        const pointers = emojiSetPointers(list);
        const sets$: Observable<(NostrEvent | undefined)[]> =
          pointers.length === 0 ? of([]) : combineLatest(pointers.map((p) => eventStore.replaceable(p)));
        return sets$.pipe(map((sets) => ({ list, sets })));
      }),
    );
  }, [me]);
  return useMemo(() => (sources ? customEmojisFrom(sources.list, sources.sets) : []), [sources]);
}
