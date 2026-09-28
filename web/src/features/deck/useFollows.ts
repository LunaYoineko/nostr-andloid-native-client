import { getPublicContacts } from "applesauce-core/helpers/contacts";
import { use$ } from "applesauce-react/hooks/use-$";
import { useEffect } from "react";
import { map } from "rxjs";
import { subscribe } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";

/**
 * 自分のフォロー（kind:3 の p タグ）。null = 未取得、[] = 取得済みで空。
 * kind:3 は購読したままにしてフォローの更新にも追従する。me が null なら購読しない。
 */
export function useFollows(me: string | null): string[] | null {
  useEffect(() => {
    if (!me) return;
    const sub = subscribe({ kinds: [3], authors: [me] }).subscribe();
    return () => sub.unsubscribe();
  }, [me]);
  const follows = use$(
    () =>
      me
        ? eventStore
            .timeline({ kinds: [3], authors: [me] })
            .pipe(map(([latest]) => (latest ? getPublicContacts(latest).map((p) => p.pubkey) : null)))
        : undefined,
    [me],
  );
  return follows ?? null;
}
