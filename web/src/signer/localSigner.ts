import * as nip04 from "nostr-tools/nip04";
import { decrypt, encrypt, getConversationKey } from "nostr-tools/nip44";
import { finalizeEvent } from "nostr-tools/pure";
import type { Signer, SignerCap } from "../nostr/signer";
import { getKeyVault, type KeyVault } from "./webKeyVault";

/**
 * 保管庫の秘密鍵（nsec）で署名する署名者（ネイティブの LocalSigner）。
 * 公開鍵はセッションの値を返し、署名・暗号は使うたびに保管庫から復号する。
 */
export function createLocalSigner(pubkey: string, vault: KeyVault = getKeyVault()): Signer {
  return {
    publicKey: async () => pubkey,
    // finalizeEvent は引数に id / pubkey / sig を書き込むので、呼び出し側のテンプレートを渡さない
    signEvent: (t) =>
      vault.withPrivateKey((sk) =>
        finalizeEvent(
          { kind: t.kind, content: t.content, tags: t.tags.map((tag) => [...tag]), created_at: t.created_at },
          sk,
        ),
      ),
    nip44: {
      encrypt: (peer, plaintext) =>
        vault.withPrivateKey((sk) => {
          const ck = getConversationKey(sk, peer);
          try {
            return encrypt(plaintext, ck);
          } finally {
            ck.fill(0);
          }
        }),
      decrypt: (peer, ciphertext) =>
        vault.withPrivateKey((sk) => {
          const ck = getConversationKey(sk, peer);
          try {
            return decrypt(ciphertext, ck);
          } finally {
            ck.fill(0);
          }
        }),
    },
    nip04: {
      encrypt: (peer, plaintext) => vault.withPrivateKey((sk) => nip04.encrypt(sk, peer, plaintext)),
      decrypt: (peer, ciphertext) => vault.withPrivateKey((sk) => nip04.decrypt(sk, peer, ciphertext)),
    },
    caps: new Set<SignerCap>(["sign", "nip44", "nip04"]),
  };
}
