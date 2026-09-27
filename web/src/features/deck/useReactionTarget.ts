import { getEventPointerFromETag } from "applesauce-core/helpers/pointers";
import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { useMemo } from "react";
import { eventStore } from "../../nostr/store";

/**
 * リアクション（kind:7）の対象の投稿。最後の e タグ（NIP-25）の ID を EventStore から引く
 * （ストアに無ければ eventLoader がリレーへ取りに行く）。解決できるまでは undefined。
 */
export function useReactionTarget(reaction: NostrEvent): NostrEvent | undefined {
  const pointer = useMemo(() => {
    const tag = reaction.tags.findLast((t) => t[0] === "e");
    return tag ? getEventPointerFromETag(tag) : null;
  }, [reaction]);
  return use$(() => (pointer ? eventStore.event(pointer) : undefined), [pointer]);
}
