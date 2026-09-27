import { ScreenHeader } from "../../ui/ScreenHeader";
import { ComingSoon } from "../screens/ComingSoon";
import { parseEventRef } from "./refs";

/** スレッドの詳細（/e/:ref）。#456 が本文を差し替える（ヘッダと onBack はそのまま使える） */
export function ThreadOverlay({ refParam, onBack }: { refParam: string; onBack: () => void }) {
  const pointer = parseEventRef(refParam);
  return (
    <>
      <ScreenHeader title="スレッド" subtitle="NIP-10" onBack={onBack} />
      <ComingSoon>{pointer ? "スレッドの表示は準備中です" : "URL が正しくありません"}</ComingSoon>
    </>
  );
}
