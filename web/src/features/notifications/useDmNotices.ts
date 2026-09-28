import { useMemo } from "react";
import { useDmSeen } from "../dm/dmSeen";
import { conversationsOf, useDm } from "../dm/dmStore";
import { useMuteMatcher } from "../mute/muteList";
import { dmNotices, type NotificationItem } from "./notificationModel";

const NO_ITEMS: NotificationItem[] = [];

/**
 * 未読のある DM 会話の通知行（通知カラム・通知画面・フォロー中カラムに混ぜる。ネイティブ #419）。
 * 相手がミュート対象の会話は除く（revealMuted = そのカラムで「ミュートを表示」中なら除かない）。
 * enabled = false の間は DM を読まない（混ぜないカラムで会話の一覧を計算しない）
 */
export function useDmNotices(enabled: boolean, revealMuted: boolean): NotificationItem[] {
  const messages = useDm((s) => (enabled ? s.messages : null));
  const me = useDm((s) => s.owner);
  const first = useDmSeen((s) => s.first);
  const peers = useDmSeen((s) => s.peers);
  const matcher = useMuteMatcher();
  return useMemo(() => {
    if (messages === null) return NO_ITEMS;
    const notices = dmNotices(conversationsOf(Object.values(messages), me, { first, peers }));
    if (revealMuted || matcher.isEmpty) return notices;
    return notices.filter((n) => !matcher.users.has(n.actor));
  }, [messages, me, first, peers, matcher, revealMuted]);
}
