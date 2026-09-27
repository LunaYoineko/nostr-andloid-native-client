import { normalizeURL } from "applesauce-core/helpers/url";
import type { NostrEvent } from "nostr-tools/pure";

/**
 * kind:10050（DM を受けるリレー）の relay タグ → リレー URL（ネイティブ updateDmRelayList）。
 * Web は ws:// を使えないので wss:// だけ。正規化して重複を除く
 */
export function dmRelaysFromEvent(event: NostrEvent): string[] {
  const urls = new Set<string>();
  for (const tag of event.tags) {
    const value = tag[0] === "relay" ? tag[1] : undefined;
    if (typeof value !== "string" || !value.startsWith("wss://")) continue;
    try {
      new URL(value);
    } catch {
      continue;
    }
    urls.add(normalizeURL(value));
  }
  return [...urls];
}
