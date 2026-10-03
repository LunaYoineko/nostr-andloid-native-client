import { useMemo } from "react";
import { openCompose } from "../../features/compose/composeStore";
import { ThreadScreen } from "../../features/thread/ThreadScreen";
import { useT } from "../../i18n";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { ComingSoon } from "../screens/ComingSoon";
import { parseEventRef } from "./refs";

/**
 * スレッド / 記事の詳細（/e/:ref。#534 で naddr1… も受ける）。下端の返信ボックスは返信の投稿シート（#458）を開く。
 * ヘッダは ThreadScreen が持つ（起点が kind:30023 なら「記事」、それ以外は「スレッド」。ProfileOverlay と同じ構成）。
 */
export function ThreadOverlay({ refParam, onBack }: { refParam: string; onBack: () => void }) {
  const t = useT();
  const ref = useMemo(() => parseEventRef(refParam), [refParam]);
  if (!ref) {
    return (
      <>
        <ScreenHeader title={t("thread_title")} subtitle="NIP-10" onBack={onBack} />
        <ComingSoon>{t("web_route_invalid_url")}</ComingSoon>
      </>
    );
  }
  return (
    <ThreadScreen
      key={refParam}
      pointer={ref}
      onBack={onBack}
      onReply={(target) => openCompose({ mode: "reply", target })}
    />
  );
}
