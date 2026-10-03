import { ExtensionSigner } from "applesauce-signers/signers/extension-signer";
import type { EventTemplate, NostrEvent } from "nostr-tools/pure";
import { t } from "../i18n";

export type SignerCap = "sign" | "nip44" | "nip04";

type Cipher = {
  encrypt(peerPubkey: string, plaintext: string): Promise<string>;
  decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
};

/**
 * アプリ内の署名の抽象（ネイティブの Signer.kt に対応）。
 * 画面側は applesauce を直接触らず、これを経由する。
 */
export interface Signer {
  /** x-only 公開鍵（hex, 64 文字） */
  publicKey(): Promise<string>;
  /** 署名済みイベントを返す（id / pubkey / sig を確定） */
  signEvent(unsigned: EventTemplate): Promise<NostrEvent>;
  /** NIP-44 暗号（DM 等）。未対応なら undefined で caps に "nip44" を持たない */
  nip44?: Cipher;
  /** NIP-04（レガシー互換）。未対応なら undefined */
  nip04?: Cipher;
  caps: ReadonlySet<SignerCap>;
}

/**
 * NIP-07（window.nostr）の署名者。applesauce の ExtensionSigner を包む。
 * caps は作成時点の window.nostr.nip44 / nip04 の有無で決める。
 */
export function createNip07Signer(): Signer {
  const inner = new ExtensionSigner();
  const caps = new Set<SignerCap>(["sign"]);
  if (window.nostr?.nip44) caps.add("nip44");
  if (window.nostr?.nip04) caps.add("nip04");
  return {
    publicKey: () => inner.getPublicKey(),
    signEvent: (unsigned) => inner.signEvent(unsigned),
    nip44: caps.has("nip44") ? cipherOf(() => inner.nip44) : undefined,
    nip04: caps.has("nip04") ? cipherOf(() => inner.nip04) : undefined,
    caps,
  };
}

// 拡張が後から差し替わっても呼び出し時点の実装を使う
function cipherOf(get: () => Cipher | undefined): Cipher {
  const current = (): Cipher => {
    const cipher = get();
    if (!cipher) throw new Error(t("web_signer_no_cipher"));
    return cipher;
  };
  return {
    encrypt: async (peerPubkey, plaintext) => current().encrypt(peerPubkey, plaintext),
    decrypt: async (peerPubkey, ciphertext) => current().decrypt(peerPubkey, ciphertext),
  };
}
