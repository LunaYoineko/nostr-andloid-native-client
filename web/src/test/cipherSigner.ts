import * as nip04 from "nostr-tools/nip04";
import * as nip44 from "nostr-tools/nip44";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { Signer, SignerCap } from "../nostr/signer";

/**
 * テスト用: 本物の鍵で署名・暗号する署名者（NIP-44 / NIP-04 の有無を選べる）。
 * createTestSigner（fakeSigner.ts）と違い暗号も使える。
 */
export function createCipherSigner(opts: { nip44?: boolean; nip04?: boolean } = {}) {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const caps = new Set<SignerCap>(["sign"]);
  const signer: Signer = {
    publicKey: async () => pubkey,
    signEvent: async (unsigned) => finalizeEvent(unsigned, secretKey),
    caps,
  };
  if (opts.nip44 !== false) {
    caps.add("nip44");
    signer.nip44 = {
      encrypt: async (peer, plaintext) => nip44.encrypt(plaintext, nip44.getConversationKey(secretKey, peer)),
      decrypt: async (peer, ciphertext) =>
        nip44.decrypt(ciphertext, nip44.getConversationKey(secretKey, peer)),
    };
  }
  if (opts.nip04 !== false) {
    caps.add("nip04");
    signer.nip04 = {
      encrypt: async (peer, plaintext) => nip04.encrypt(secretKey, peer, plaintext),
      decrypt: async (peer, ciphertext) => nip04.decrypt(secretKey, peer, ciphertext),
    };
  }
  return { signer, pubkey, secretKey };
}
