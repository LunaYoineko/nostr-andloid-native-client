import { useDmSeen } from "../dm/dmSeen";
import { conversationsOf, useDm } from "../dm/dmStore";

/** メッセージ画面の「DM | チャット」（ネイティブ MessagesSegmentBar / DeckState.messagesSegment） */
export type MessagesSegment = "dm" | "chat";

/** 最後に使った側（"dm" | "chat"）。「DM | チャット」を切り替えたときだけ書く */
export const MESSAGES_SEGMENT_KEY = "nostrism.messages.segment";

export const SEGMENT_PATH: Record<MessagesSegment, string> = { dm: "/messages", chat: "/channels" };

/** 最後に使った側（無い・壊れていれば DM） */
export function loadSegment(): MessagesSegment {
  try {
    return localStorage.getItem(MESSAGES_SEGMENT_KEY) === "chat" ? "chat" : "dm";
  } catch {
    return "dm";
  }
}

export function saveSegment(segment: MessagesSegment): void {
  try {
    localStorage.setItem(MESSAGES_SEGMENT_KEY, segment);
  } catch {
    // 保存できない環境では次回は DM から
  }
}

/** 下部ナビ・レールの「メッセージ」の行き先（ネイティブ openMessages: 未読の DM があれば DM、無ければ最後に使った側） */
export function messagesPath(dmUnread: number, last: MessagesSegment): string {
  return SEGMENT_PATH[dmUnread > 0 ? "dm" : last];
}

/** いまの DM の未読の合計（押したときに読む。useDmUnreadTotal と同じ計算） */
export function dmUnreadNow(): number {
  const { messages, owner } = useDm.getState();
  const { first, peers } = useDmSeen.getState();
  return conversationsOf(Object.values(messages), owner, { first, peers }).reduce(
    (sum, c) => sum + c.unread,
    0,
  );
}
