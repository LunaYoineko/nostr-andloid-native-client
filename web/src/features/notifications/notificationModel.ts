import type { EventPointer } from "applesauce-core/helpers/pointers";
import type { NostrEvent } from "nostr-tools/pure";
import { hrefForEvent, oneLine } from "../../lib/content/labels";
import { articleTitleOf } from "../../lib/content/tags";
import { zapAmountSats, zapSenderOf } from "../../lib/nip57";
import { plainTextOf } from "../actions/noteLinks";
import { normalizeReaction } from "../thread/engagement";

/**
 * 通知の 1 件（ネイティブの EventRepository.kt toNotification / Nostr.sq notificationsFor の写し）。
 * 同じ投稿への反応も束ねない（1 件 = 1 行）。
 */

export type NotificationKind = "reply" | "mention" | "reaction" | "repost" | "zap";

/** 表示する件数の上限（ネイティブ notificationsFor の LIMIT） */
export const NOTIFICATIONS_MAX = 200;
/** 返信・メンションの見出しに出す対象の抜粋の長さ（コードポイント） */
export const SNIPPET_MAX = 80;

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  event: NostrEvent;
  /** 相手（Zap は送った人） */
  actor: string;
  createdAt: number;
  /** 対象（自分の投稿）= 最後の e タグ */
  target: EventPointer | null;
  reaction: { display: string; imageUrl: string | null } | null;
  zapSats: number | null;
};

const HEX64 = /^[0-9a-f]{64}$/i;

/** 対象 = 小文字 e タグのうち最後のもの。値が 64 桁 hex でなければ null。3 番目が wss:// ならリレーのヒント */
export function targetPointerOf(event: NostrEvent): EventPointer | null {
  for (let i = event.tags.length - 1; i >= 0; i--) {
    const tag = event.tags[i];
    if (tag[0] !== "e") continue;
    const id = tag[1];
    if (id === undefined || !HEX64.test(id)) return null;
    const relay = tag[2];
    return relay?.startsWith("wss://") ? { id: id.toLowerCase(), relays: [relay] } : { id: id.toLowerCase() };
  }
  return null;
}

/** 通知の種別と相手・対象。通知にならない kind は null */
export function toNotification(event: NostrEvent): NotificationItem | null {
  const base = {
    id: event.id,
    event,
    actor: event.pubkey,
    createdAt: event.created_at,
    target: targetPointerOf(event),
    reaction: null,
    zapSats: null,
  };
  switch (event.kind) {
    case 9735:
      return {
        ...base,
        kind: "zap",
        actor: zapSenderOf(event.tags) ?? event.pubkey,
        zapSats: zapAmountSats(event.tags),
      };
    case 7:
      return { ...base, kind: "reaction", reaction: normalizeReaction(event.content, event.tags) };
    case 6:
    case 16:
      return { ...base, kind: "repost" };
    case 1111:
      return { ...base, kind: "reply" };
    case 1:
      return { ...base, kind: event.tags.some((t) => t[0] === "e") ? "reply" : "mention" };
    default:
      return null;
  }
}

/** 自分以外の通知を新しい順（同時刻は入力順）に先頭 NOTIFICATIONS_MAX 件。未ログインなら空 */
export function notificationsFrom(events: readonly NostrEvent[], me: string | null): NotificationItem[] {
  if (me === null) return [];
  const items: NotificationItem[] = [];
  for (const event of events) {
    if (event.pubkey === me) continue;
    const item = toNotification(event);
    if (item) items.push(item);
  }
  // Array.prototype.sort は安定なので、同時刻は入力順のまま
  return items.sort((a, b) => b.createdAt - a.createdAt).slice(0, NOTIFICATIONS_MAX);
}

/** 対象の 1 行の抜粋（記事はタイトル、他はメディアの URL を除いた本文の先頭 80 文字） */
export function notificationSnippet(target: NostrEvent): string {
  return oneLine([...(articleTitleOf(target) ?? plainTextOf(target))].slice(0, SNIPPET_MAX).join(""));
}

/** 行を押したときに開くスレッド（対象があれば対象、無ければ通知そのもの） */
export function notificationHref(item: NotificationItem): string {
  return hrefForEvent(item.target ?? { id: item.id });
}

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  reply: "返信",
  mention: "メンション",
  reaction: "リアクション",
  repost: "リポスト",
  zap: "Zap",
};
