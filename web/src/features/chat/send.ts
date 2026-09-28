import type { NostrEvent } from "nostr-tools/pure";
import { writeRelays } from "../../nostr/pool";
import { publishEvent } from "../../nostr/publish";
import { normalizeRelayUrl } from "../compose/tags";
import { buildChannelMessage } from "./chatMessage";

/** 発言の送り先: write リレー ∪ チャンネルのリレー（wss:// のみ。ネイティブは write ∪ 接続中 = チャンネルのリレーを含む） */
export function chatRelays(
  channelRelays: readonly string[],
  write: readonly string[] = writeRelays(),
): string[] {
  const out = new Map<string, string>();
  for (const url of [...write, ...channelRelays]) {
    if (!url.startsWith("wss://")) continue;
    const key = normalizeRelayUrl(url);
    if (!out.has(key)) out.set(key, url);
  }
  return [...out.values()];
}

/**
 * 発言を送る（送信キュー = publishEvent を通す。受理が無ければ「未送信」として残り、再送の対象になる）。
 * 本文が空なら送らず null。
 */
export async function sendChannelMessage(a: {
  channelId: string;
  channelRelays: readonly string[];
  content: string;
  replyTo: NostrEvent | null;
  emojis: ReadonlyMap<string, string>;
}): Promise<NostrEvent | null> {
  if (a.content.trim() === "") return null;
  const draft = buildChannelMessage({
    channelId: a.channelId,
    hint: a.channelRelays[0] ?? "",
    content: a.content,
    replyTo: a.replyTo,
    emojis: a.emojis,
  });
  return publishEvent(draft, { relays: chatRelays(a.channelRelays) });
}
