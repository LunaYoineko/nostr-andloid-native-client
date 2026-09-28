import { useMemo } from "react";
import { roomColumnFor } from "../../lib/columns";
import { useDeck } from "../../store/deck";
import type { Channel } from "./channels";

/**
 * 一覧の「ピン留め」（ネイティブ PublicChatScreen の onPinChannel）: ルームを固定カラムにしてそこへ jump する
 * （デッキの外からの jump はデッキへ出る = AppShell）。既にあればそのカラムを固定して jump する。
 */
export function pinRoom(channel: Pick<Channel, "id" | "name" | "about">): void {
  const deck = useDeck.getState();
  const id = deck.openTransient(roomColumnFor(channel));
  deck.pin(id);
}

/** デッキにピン留め済みのルームの channelId（一覧のピンの色。ネイティブ pinnedRoomChannelIds） */
export function usePinnedRoomIds(): ReadonlySet<string> {
  const key = useDeck((s) =>
    s.columns
      .flatMap((c) =>
        c.pinned && c.kind === "CHANNEL_ROOM" && c.filter.channelId ? [c.filter.channelId] : [],
      )
      .join(","),
  );
  return useMemo(() => new Set(key === "" ? [] : key.split(",")), [key]);
}
