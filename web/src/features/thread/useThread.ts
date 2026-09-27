import type { EventPointer } from "applesauce-core/helpers/pointers";
import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { useEffect, useMemo, useState } from "react";
import { map } from "rxjs";
import { LOADING_TIMEOUT_MS } from "../../lib/columnRequest";
import { useEventByPointer } from "../../nostr/loaders";
import { subscribeTo, useReadRelays } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { isNoteMuted, useMuteMatcher } from "../mute/muteList";
import {
  anchorsKey,
  buildThread,
  ENGAGEMENT_LIMIT,
  type ThreadAnchors,
  type ThreadEntry,
  threadAnchors,
  threadRequestFilters,
  threadViewFilters,
} from "./threadTree";

/** URL のリレーヒントから足すのは先頭この件数まで */
const MAX_HINT_RELAYS = 3;

const NO_EVENTS: NostrEvent[] = [];
const NO_ENTRIES: ThreadEntry[] = [];

const resolveEvent = (id: string) => eventStore.getEvent(id);

export type Thread = {
  /** 開いた投稿（未取得の間は undefined） */
  focus: NostrEvent | undefined;
  anchors: ThreadAnchors;
  /** root から深さ優先の順の行（ミュート対象の行は除く。起点は残す） */
  entries: ThreadEntry[];
  /** 起点を e タグで指す投稿・リポスト・リアクション（集計は engagement.ts） */
  engagementEvents: NostrEvent[];
  /** 最初の EOSE（または 8 秒経過）まで true。張り直しでは戻さない */
  loading: boolean;
};

/**
 * スレッドの購読と表示（ネイティブの EventRepository.kt subscribeThread / subscribeNoteEngagement / threadFeed）。
 * 起点が届いて root が決まったら返信の REQ を張り直す（URL 直開きで起点が未取得のまま開いた場合）。
 */
export function useThread(pointer: EventPointer): Thread {
  const focus = useEventByPointer(pointer);
  const latest = useMemo(() => threadAnchors(pointer.id, focus), [pointer.id, focus]);
  // ids と address が同じ間は前のオブジェクトを使い続ける（起点が届いても root が同じなら張り直さない）
  const [anchors, setAnchors] = useState(latest);
  const key = anchorsKey(latest);
  if (key !== anchorsKey(anchors)) setAnchors(latest);

  // read リレー + URL のリレーヒント（wss:// のみ）。ヒントは中身で比べる
  const relays = useReadRelays();
  const hintKey = JSON.stringify(
    (pointer.relays ?? []).filter((url) => url.startsWith("wss://")).slice(0, MAX_HINT_RELAYS),
  );
  const threadRelays = useMemo(
    () => [...new Set([...relays, ...(JSON.parse(hintKey) as string[])])],
    [relays, hintKey],
  );

  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  // 返信の REQ。root が決まるなど条件が変わったら前の REQ を CLOSE して張り直す
  useEffect(() => {
    const sub = subscribeTo(threadRelays, threadRequestFilters(anchors)).subscribe(() => setLoading(false));
    return () => sub.unsubscribe();
  }, [threadRelays, anchors]);

  // 起点への反応の REQ（起点の id と read リレーで決まる）
  useEffect(() => {
    const sub = subscribeTo(relays, [
      { kinds: [7, 6, 16], "#e": [pointer.id], limit: ENGAGEMENT_LIMIT },
    ]).subscribe();
    return () => sub.unsubscribe();
  }, [relays, pointer.id]);

  const allEntries =
    use$(
      () =>
        eventStore
          .timeline(threadViewFilters(anchors))
          .pipe(map((list) => buildThread(list, pointer.id, anchors.rootId))),
      [anchors, pointer.id],
    ) ?? NO_ENTRIES;

  // ミュート（#465）。起点は残し、それ以外のミュート対象の行を隠す（ネイティブ ThreadColumn と同じ）
  const me = useSession((s) => s.pubkey);
  const matcher = useMuteMatcher();
  const entries = useMemo(
    () =>
      matcher.isEmpty
        ? allEntries
        : allEntries.filter(
            (entry) => entry.event.id === pointer.id || !isNoteMuted(matcher, entry.event, me, resolveEvent),
          ),
    [allEntries, matcher, me, pointer.id],
  );

  const engagementEvents =
    use$(() => eventStore.timeline([{ kinds: [1, 1111, 6, 16, 7], "#e": [pointer.id] }]), [pointer.id]) ??
    NO_EVENTS;

  return { focus, anchors, entries, engagementEvents, loading };
}
