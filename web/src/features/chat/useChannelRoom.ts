import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { useEffect, useMemo, useState } from "react";
import { LOADING_TIMEOUT_MS } from "../../lib/columnRequest";
import { subscribeTo, useReadRelays } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { normalizeRelayUrl } from "../compose/tags";
import { useMuteMatcher } from "../mute/muteList";
import { groupReactions, lastETagValue, type ReactionGroup } from "../thread/engagement";
import { ensureChannels, useChannel } from "./channels";
import {
  isChatMessageMuted,
  REACTION_LIMIT,
  REACTION_TARGET_MAX,
  ROOM_LIMIT,
  ROOM_SHOW_MAX,
} from "./chatMessage";

export type ChannelRoomFeed = {
  /** 最初の EOSE（または 8 秒経過）まで true */
  loading: boolean;
  /** 発言（新しい順。上限 ROOM_SHOW_MAX。ミュート対象は除く = revealMuted なら除かない） */
  messages: NostrEvent[];
  /** 発言 id → リアクション（表示ごとの集計。多い順） */
  reactions: ReadonlyMap<string, ReactionGroup[]>;
  /** チャンネルの content.relays（wss:// のみ。一覧が取れるまで空） */
  channelRelays: string[];
};

const NO_EVENTS: NostrEvent[] = [];
const NO_RELAYS: string[] = [];

/** 購読先: read リレー ∪ チャンネルのリレー（重複は末尾の / を除いて比べる）。改行区切りの 1 文字列（依存のキー用） */
function relayKeyOf(read: readonly string[], channelRelays: readonly string[]): string {
  const out = new Map<string, string>();
  for (const url of [...read, ...channelRelays]) {
    const key = normalizeRelayUrl(url);
    if (!out.has(key)) out.set(key, url);
  }
  return [...out.values()].join("\n");
}

/**
 * チャンネルのルーム（ネイティブ LiveChannelRoom + subscribeChannel / connectChannelRelays / subscribeChannelReactions）。
 * kind:42 `#e=[channelId]` を read リレーとチャンネルのリレーへ張ったままにし、表示中の発言へのリアクション（kind:7）も
 * 購読する。チャンネルのリレーを知るため、一覧がまだ無ければ取りに行く。
 */
export function useChannelRoom(channelId: string, revealMuted = false): ChannelRoomFeed {
  const channel = useChannel(channelId);
  useEffect(() => {
    ensureChannels();
  }, []);

  const read = useReadRelays();
  const channelRelays = useMemo(
    () => channel?.relays.filter((url) => url.startsWith("wss://")) ?? NO_RELAYS,
    [channel?.relays],
  );
  const relayKey = relayKeyOf(read, channelRelays);

  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const done = () => setLoading(false);
    const timer = setTimeout(done, LOADING_TIMEOUT_MS);
    const sub = subscribeTo(relayKey.split("\n"), [
      { kinds: [42], "#e": [channelId], limit: ROOM_LIMIT },
    ]).subscribe(done);
    return () => {
      clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [channelId, relayKey]);

  const all = use$(() => eventStore.timeline({ kinds: [42], "#e": [channelId] }), [channelId]) ?? NO_EVENTS;
  const matcher = useMuteMatcher();
  const messages = useMemo(() => {
    const shown = all.slice(0, ROOM_SHOW_MAX);
    return revealMuted ? shown : shown.filter((m) => !isChatMessageMuted(matcher, m));
  }, [all, matcher, revealMuted]);

  // 表示中の発言へのリアクション（id の並びが変わったら張り直す）
  const targetKey = messages
    .slice(0, REACTION_TARGET_MAX)
    .map((m) => m.id)
    .join(",");
  useEffect(() => {
    if (targetKey === "") return;
    const sub = subscribeTo(relayKey.split("\n"), [
      { kinds: [7], "#e": targetKey.split(","), limit: REACTION_LIMIT },
    ]).subscribe();
    return () => sub.unsubscribe();
  }, [targetKey, relayKey]);

  const reactionEvents =
    use$(
      () => (targetKey === "" ? undefined : eventStore.timeline({ kinds: [7], "#e": targetKey.split(",") })),
      [targetKey],
    ) ?? NO_EVENTS;
  const reactions = useMemo(() => {
    const byTarget = new Map<string, NostrEvent[]>();
    for (const event of reactionEvents) {
      const id = lastETagValue(event);
      if (id === null) continue;
      const list = byTarget.get(id);
      if (list) list.push(event);
      else byTarget.set(id, [event]);
    }
    const out = new Map<string, ReactionGroup[]>();
    for (const [id, list] of byTarget) out.set(id, groupReactions(list, id));
    return out;
  }, [reactionEvents]);

  return { loading, messages, reactions, channelRelays };
}
