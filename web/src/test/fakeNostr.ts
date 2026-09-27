import { vi } from "vitest";
import { useSession } from "../signer/session";

export const PUBKEY = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
export const OTHER_PUBKEY = "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2";

/** window.nostr（NIP-07）のフェイクを入れる。reject なら getPublicKey が拒否する */
export function installFakeNostr(opts: { pubkey?: string; reject?: boolean } = {}) {
  const getPublicKey = vi.fn(async () => {
    if (opts.reject) throw new Error("user rejected");
    return opts.pubkey ?? PUBKEY;
  });
  window.nostr = {
    getPublicKey,
    signEvent: vi.fn(async () => {
      throw new Error("not used in tests");
    }),
  };
  return { getPublicKey };
}

/** テスト間でフェイク・保存・ストアを初期状態へ戻す */
export function resetSession() {
  delete window.nostr;
  localStorage.clear();
  useSession.setState({ status: "loading", method: null, pubkey: null });
}
