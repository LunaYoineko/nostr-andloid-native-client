import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { Signer } from "../nostr/signer";

/** 本物の鍵で署名するテスト用の署名者（拡張機能を使わない） */
export function createTestSigner(): { signer: Signer; pubkey: string; secretKey: Uint8Array } {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const signer: Signer = {
    publicKey: async () => pubkey,
    signEvent: async (unsigned) => finalizeEvent(unsigned, secretKey),
    caps: new Set(["sign"]),
  };
  return { signer, pubkey, secretKey };
}
