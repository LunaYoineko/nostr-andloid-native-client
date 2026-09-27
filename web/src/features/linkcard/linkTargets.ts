import { Tokens } from "applesauce-core/helpers/regexp";
import type { NostrEvent } from "nostr-tools/pure";
import { mediaKindOf, trimUrlTail } from "../../lib/media";

/**
 * 1 投稿の埋め込みの上限（ネイティブ Embed.kt detectEmbeds(max = 4)）。
 * 画像を除いた URL（動画・YouTube・リンクカード）を出現順に数える。
 */
export const EMBED_LIMIT = 4;

const NONE: readonly string[] = [];
const cache = new WeakMap<NostrEvent, readonly string[]>();

/**
 * リンクカードにする URL（出現順・重複なし）。ネイティブの detectEmbeds と同じく、画像以外の URL を出現順に
 * EMBED_LIMIT 件まで数え、そのうち動画・YouTube 以外（OGP・Spotify）を返す。nostr: 参照は URL ではないので入らない。
 * イベントごとに 1 回だけ計算し、同じ配列を返す。
 */
export function linkCardUrls(event: NostrEvent): readonly string[] {
  const cached = cache.get(event);
  if (cached) return cached;

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const match of event.content.matchAll(Tokens.link)) {
    const url = trimUrlTail(match[0]);
    if (seen.has(url)) continue;
    const kind = mediaKindOf(url);
    if (kind === "image") continue;
    seen.add(url);
    if (kind === null) urls.push(url);
    if (seen.size >= EMBED_LIMIT) break;
  }

  const result = urls.length > 0 ? urls : NONE;
  cache.set(event, result);
  return result;
}
