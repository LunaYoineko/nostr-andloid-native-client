import { shortNpub } from "../../lib/npub";
import { displayName, useProfile } from "../../nostr/loaders";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { ComingSoon } from "../screens/ComingSoon";
import { parseProfileRef } from "./refs";

/** プロフィールの詳細（/p/:ref）。#457 が本文を差し替える */
export function ProfileOverlay({ refParam, onBack }: { refParam: string; onBack: () => void }) {
  const pubkey = parseProfileRef(refParam)?.pubkey;
  const profile = useProfile(pubkey);
  if (!pubkey) {
    return (
      <>
        <ScreenHeader title="プロフィール" onBack={onBack} />
        <ComingSoon>URL が正しくありません</ComingSoon>
      </>
    );
  }
  return (
    <>
      <ScreenHeader title={displayName(profile, pubkey)} subtitle={shortNpub(pubkey)} onBack={onBack} />
      <ComingSoon>プロフィールの表示は準備中です</ComingSoon>
    </>
  );
}
