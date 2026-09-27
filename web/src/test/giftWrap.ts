import * as nip44 from "nostr-tools/nip44";
import {
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  getPublicKey,
  type NostrEvent,
} from "nostr-tools/pure";

/**
 * テスト用: NIP-17 の gift wrap を nostr-tools の関数だけで組み立てる（送信側の実装は使わない）。
 * 壊れた中身を包めるよう、各段は JSON の文字列を受け取る。
 */

export const DM_TIME = 1_700_000_000;

/** rumor（kind:14、未署名。id は正しい値） */
export function makeRumor(
  senderKey: Uint8Array,
  input: { content: string; tags: string[][]; created_at?: number; kind?: number },
) {
  const rumor = {
    pubkey: getPublicKey(senderKey),
    created_at: input.created_at ?? DM_TIME,
    kind: input.kind ?? 14,
    tags: input.tags,
    content: input.content,
  };
  return { ...rumor, id: getEventHash(rumor) };
}

/** 中身（rumor の JSON）を sealKey で seal（kind:13）にし、recipient 宛てに暗号化する */
export function makeSeal(rumorJson: string, sealKey: Uint8Array, recipient: string): NostrEvent {
  return finalizeEvent(
    {
      kind: 13,
      created_at: DM_TIME,
      tags: [],
      content: nip44.encrypt(rumorJson, nip44.getConversationKey(sealKey, recipient)),
    },
    sealKey,
  );
}

/** 中身（seal の JSON）を使い捨て鍵で recipient 宛ての gift wrap（kind:1059）にする */
export function makeWrap(sealJson: string, recipient: string, createdAt = DM_TIME): NostrEvent {
  const wrapKey = generateSecretKey();
  return finalizeEvent(
    {
      kind: 1059,
      created_at: createdAt,
      tags: [["p", recipient]],
      content: nip44.encrypt(sealJson, nip44.getConversationKey(wrapKey, recipient)),
    },
    wrapKey,
  );
}

/** rumor を senderKey の seal で包み、recipient 宛ての gift wrap にする */
export function giftWrap(rumor: object, senderKey: Uint8Array, recipient: string, createdAt = DM_TIME) {
  return makeWrap(
    JSON.stringify(makeSeal(JSON.stringify(rumor), senderKey, recipient)),
    recipient,
    createdAt,
  );
}
