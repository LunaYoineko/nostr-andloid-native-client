import { neventEncode, noteEncode } from "nostr-tools/nip19";
import type { NostrEvent } from "nostr-tools/pure";
import { t } from "../../i18n";
import { extractMedia } from "../../lib/media";
import { showToast } from "../../ui/toast";
import { relayHintForEvent } from "../compose/relayHints";

/** 画像・動画・YouTube の URL を除き、連続する空白・空行を詰めた本文（フォールバック無し） */
function strippedText(event: NostrEvent): string {
  const media = extractMedia(event);
  let text = event.content;
  for (const url of [...media.images, ...media.videos, ...media.youtube].map((m) => m.url)) {
    text = text.split(url).join("");
  }
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * コピー用の本文（ネイティブの note.text）。画像・動画・YouTube の URL を除き、連続する空白・空行を詰める。
 * メディアだけの投稿で空になるなら content そのまま（ネイティブ #326: 空をコピーしない）。
 */
export function plainTextOf(event: NostrEvent): string {
  const text = strippedText(event);
  return text === "" ? event.content : text;
}

/** 本文にメディア以外のテキストがあるか（⋯「翻訳」を出す条件の一部。#541。plainTextOf と違い空をフォールバックしない） */
export function hasBodyText(event: NostrEvent): boolean {
  return strippedText(event) !== "";
}

/** ⋯ メニューのコピー先（nevent は作者・kind・リレーヒント 1 本入り。njump は nevent で開く） */
export function noteLinksOf(event: NostrEvent): { note1: string; nevent: string; njump: string } {
  const note1 = noteEncode(event.id);
  const hint = relayHintForEvent(event.id);
  const nevent = neventEncode({
    id: event.id,
    author: event.pubkey,
    kind: event.kind,
    relays: hint ? [hint] : [],
  });
  return { note1, nevent, njump: `https://njump.me/${nevent}` };
}

/** クリップボードへ書き、トーストで知らせる（Web には OS の通知が無い） */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(t("copied"));
  } catch {
    showToast(t("web_copy_failed"));
  }
}
