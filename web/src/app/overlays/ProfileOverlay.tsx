import { useMemo } from "react";
import { ProfileScreen } from "../../features/profile/ProfileScreen";
import { useT } from "../../i18n";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { ComingSoon } from "../screens/ComingSoon";
import { parseProfileRef } from "./refs";

/** プロフィールの詳細（/p/:ref）。ヘッダは ProfileScreen が持つ（Expanded では左ペインの中に出す） */
export function ProfileOverlay({ refParam, onBack }: { refParam: string; onBack: () => void }) {
  const t = useT();
  const pointer = useMemo(() => parseProfileRef(refParam), [refParam]);
  if (pointer) {
    return (
      <ProfileScreen
        key={pointer.pubkey}
        pubkey={pointer.pubkey}
        relayHints={pointer.relays ?? []}
        onBack={onBack}
      />
    );
  }
  return (
    <>
      <ScreenHeader title={t("profile_section")} onBack={onBack} />
      <ComingSoon>{t("web_route_invalid_url")}</ComingSoon>
    </>
  );
}
