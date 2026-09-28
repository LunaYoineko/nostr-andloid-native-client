import type { NostrEvent } from "nostr-tools/pure";
import { zapAmountSats, zapCommentOf, zapSenderOf } from "../../lib/nip57";

/**
 * 投稿ごとの Zap 受領の集計（ネイティブの EventRepository.kt zapTotals / zapsForNote と
 * Nostr.sq zapReceiptsForTargets / zapReceiptsForNote の写し）。純関数。
 * receipt（kind:9735）の e タグの値ごとにまとめる。LNURL サーバの nostrPubkey との照合はしない（ネイティブと同じ）。
 */

/** Zap 1 件。sender = Zap した人（P タグ → Zap リクエストの pubkey。どちらも無ければ null） */
export type ZapItem = {
  id: string;
  sender: string | null;
  sats: number;
  comment: string;
  createdAt: number;
};

/** totalSats = 合計、zaps = 新しい順 */
export type NoteZaps = { totalSats: number; zaps: ZapItem[] };

export const NO_ZAPS: NoteZaps = { totalSats: 0, zaps: [] };

/** receipt 群 → ノート id ごとの合計と一覧。同じ receipt id は 1 回だけ数える */
export function zapTotals(receipts: readonly NostrEvent[]): Map<string, NoteZaps> {
  const seen = new Set<string>();
  const byNote = new Map<string, NoteZaps>();
  for (const receipt of receipts) {
    if (receipt.kind !== 9735 || seen.has(receipt.id)) continue;
    seen.add(receipt.id);
    const targets = new Set<string>();
    for (const t of receipt.tags) {
      if (t[0] === "e" && typeof t[1] === "string" && t[1] !== "") targets.add(t[1]);
    }
    if (targets.size === 0) continue;
    const item: ZapItem = {
      id: receipt.id,
      sender: zapSenderOf(receipt.tags),
      sats: zapAmountSats(receipt.tags),
      comment: zapCommentOf(receipt.tags),
      createdAt: receipt.created_at,
    };
    for (const noteId of targets) {
      let note = byNote.get(noteId);
      if (!note) {
        note = { totalSats: 0, zaps: [] };
        byNote.set(noteId, note);
      }
      note.totalSats += item.sats;
      note.zaps.push(item);
    }
  }
  // Array.prototype.sort は安定なので、同時刻は入ってきた順のまま
  for (const note of byNote.values()) note.zaps.sort((a, b) => b.createdAt - a.createdAt);
  return byNote;
}

/** 小数 1 桁（n は 10 倍した整数） */
function tenths(n: number): string {
  return `${Math.floor(n / 10)}.${n % 10}`;
}

/** sats を短く整形（ネイティブ NoteItem.kt formatSats と同じ。切り捨て: 1234 → 1.2k、1000000 → 1.0M） */
export function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${tenths(Math.floor(sats / 100_000))}M`;
  if (sats >= 1_000) return `${tenths(Math.floor(sats / 100))}k`;
  return String(sats);
}
