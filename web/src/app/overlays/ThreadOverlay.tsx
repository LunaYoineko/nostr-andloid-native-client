import { useMemo } from "react";
import { ThreadScreen } from "../../features/thread/ThreadScreen";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { ComingSoon } from "../screens/ComingSoon";
import { parseEventRef } from "./refs";

/** スレッドの詳細（/e/:ref） */
export function ThreadOverlay({ refParam, onBack }: { refParam: string; onBack: () => void }) {
  const pointer = useMemo(() => parseEventRef(refParam), [refParam]);
  return (
    <>
      <ScreenHeader title="スレッド" subtitle="NIP-10" onBack={onBack} />
      {pointer ? (
        <ThreadScreen key={pointer.id} pointer={pointer} />
      ) : (
        <ComingSoon>URL が正しくありません</ComingSoon>
      )}
    </>
  );
}
