import { Tokens } from "applesauce-core/helpers/regexp";
import type { NostrEvent } from "nostr-tools/pure";
import { mediaKindOf, trimUrlTail } from "../../lib/media";
import type { EmbedPrefs } from "./embedPrefs";

/**
 * 1 投稿の埋め込みの上限（ネイティブ Embed.kt detectEmbeds(max = 4)）。
 * 画像を除いた URL（動画・YouTube・Spotify・OGP）を出現順に数える。
 */
export const EMBED_LIMIT = 4;

/** Spotify のリンク（ネイティブ Embed.kt isSpotify と同じ） */
const SPOTIFY_PATTERN = /^https?:\/\/open\.spotify\.com\//i;

/** 埋め込みの種別（ネイティブ EmbedKind。画像は detectEmbeds に出す前に除く） */
export type EmbedKind = "video" | "youtube" | "spotify" | "ogp";

/** 検出した 1 リンク（ネイティブ LinkEmbed） */
export type LinkEmbed = { url: string; kind: EmbedKind };

function embedKindOf(url: string): EmbedKind | "image" {
  const kind = mediaKindOf(url);
  if (kind) return kind;
  return SPOTIFY_PATTERN.test(url) ? "spotify" : "ogp";
}

const NONE: readonly LinkEmbed[] = [];
const detectCache = new WeakMap<NostrEvent, readonly LinkEmbed[]>();

/**
 * 本文の埋め込み候補（ネイティブの detectEmbeds）。画像を除いた URL を出現順・重複なしで EMBED_LIMIT 件まで、
 * 設定に関係なく検出する（設定は visibleEmbeds で絞る）。イベントごとに 1 回だけ計算し、同じ配列を返す。
 */
export function detectEmbeds(event: NostrEvent): readonly LinkEmbed[] {
  const cached = detectCache.get(event);
  if (cached) return cached;

  const out: LinkEmbed[] = [];
  const seen = new Set<string>();
  for (const match of event.content.matchAll(Tokens.link)) {
    const url = trimUrlTail(match[0]);
    if (seen.has(url)) continue;
    const kind = embedKindOf(url);
    if (kind === "image") continue;
    seen.add(url);
    out.push({ url, kind });
    if (out.length >= EMBED_LIMIT) break;
  }

  const result = out.length > 0 ? out : NONE;
  detectCache.set(event, result);
  return result;
}

/**
 * 設定で実際にカード / プレイヤーを出す埋め込みだけに絞る（ネイティブの visibleEmbeds）。
 * detectEmbeds で決まった上限 4 は変わらない（OFF で消えた分を後続の URL で詰めない）。
 */
export function visibleEmbeds(event: NostrEvent, prefs: EmbedPrefs): readonly LinkEmbed[] {
  const detected = detectEmbeds(event);
  const visible = detected.filter((embed) => prefs[embed.kind]);
  return visible.length === detected.length ? detected : visible.length > 0 ? visible : NONE;
}

const NONE_URLS: readonly string[] = [];

/**
 * 本文から畳むべきカード化済み URL（ネイティブの cardedUrlsToHide）。hideCardedUrls が false なら空。
 * 画像・動画（直リンク）は常に本文から除かれる（W/lib/content/parse.ts の stripMediaLinks）ので、
 * ここで効くのは OGP・YouTube・Spotify。
 */
export function cardedUrlsToHide(event: NostrEvent, prefs: EmbedPrefs): readonly string[] {
  if (!prefs.hideCardedUrls) return NONE_URLS;
  const visible = visibleEmbeds(event, prefs).filter((embed) => embed.kind !== "video");
  return visible.length === 0 ? NONE_URLS : visible.map((embed) => embed.url);
}
