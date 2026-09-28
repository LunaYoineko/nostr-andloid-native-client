import type { EventTemplate, NostrEvent } from "nostr-tools/pure";

/**
 * NIP-51 の「公開 e タグの並びがそのまま中身」なリスト（kind:10003 ブックマーク / kind:10001 固定投稿）の
 * 解析・再構築（ネイティブ EventRepository.kt の EIdList / updateBookmarkList / updatePinnedList /
 * publishEIdList の写し）。非公開部分（content）・未知タグ（e 以外）は中身を見ずにそのまま保つ
 * （ネイティブも公開の e タグだけを扱う。#531 の「触らないもの」）。
 */

export type EIdListState = {
  /** 元イベントの id（まだ無ければ null） */
  eventId: string | null;
  createdAt: number;
  /** e タグの id（出現順、重複なし） */
  ids: string[];
  /** e 以外のタグ（元の順序のまま。再発行で保つ） */
  otherTags: string[][];
  /** 元の content（非公開部分。中身は見ない・変えない） */
  content: string;
};

/** まだイベントが無いときのリスト */
export const EMPTY_EID_LIST: EIdListState = {
  eventId: null,
  createdAt: 0,
  ids: [],
  otherTags: [],
  content: "",
};

/** kind:10003 / 10001 を解析する（null なら EMPTY_EID_LIST） */
export function parseEIdList(event: NostrEvent | null): EIdListState {
  if (!event) return EMPTY_EID_LIST;
  const ids: string[] = [];
  const otherTags: string[][] = [];
  for (const tag of event.tags) {
    if (tag[0] === "e" && typeof tag[1] === "string") {
      if (!ids.includes(tag[1])) ids.push(tag[1]);
    } else {
      otherTags.push(tag);
    }
  }
  return { eventId: event.id, createdAt: event.created_at, ids, otherTags, content: event.content };
}

/**
 * 発行する kind:10003 / 10001（ネイティブ publishEIdList: `ids.map { listOf("e", it) } + target.other`）。
 * content は base のまま（非公開部分は触らない）。
 */
export function buildEIdListTemplate(
  base: EIdListState,
  kind: number,
  ids: readonly string[],
  nowSec: number,
): EventTemplate {
  return {
    kind,
    content: base.content,
    tags: [...ids.map((id) => ["e", id]), ...base.otherTags],
    // 同じ秒に続けて押しても、置換可能イベントの新旧が崩れないように
    created_at: Math.max(nowSec, base.createdAt + 1),
  };
}
