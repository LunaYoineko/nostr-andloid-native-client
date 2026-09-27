import { useMemo } from "react";
import { openCompose } from "../../features/compose/composeStore";
import { ThreadScreen } from "../../features/thread/ThreadScreen";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { ComingSoon } from "../screens/ComingSoon";
import { parseEventRef } from "./refs";

/** スレッドの詳細（/e/:ref）。下端の返信ボックスは返信の投稿シート（#458）を開く */
export function ThreadOverlay({ refParam, onBack }: { refParam: string; onBack: () => void }) {
  const pointer = useMemo(() => parseEventRef(refParam), [refParam]);
  return (
    <>
      <ScreenHeader title="スレッド" subtitle="NIP-10" onBack={onBack} />
      {pointer ? (
        <ThreadScreen
          key={pointer.id}
          pointer={pointer}
          onReply={(target) => openCompose({ mode: "reply", target })}
        />
      ) : (
        <ComingSoon>URL が正しくありません</ComingSoon>
      )}
    </>
  );
}
