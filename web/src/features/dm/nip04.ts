import type { NostrEvent } from "nostr-tools/pure";
import type { DmMessageRow } from "../../db/schema";
import type { Signer } from "../../nostr/signer";
import { decryptWith } from "./nip17";

/**
 * NIP-04 の DM（kind:4）を復号して会話の 1 件にする（ネイティブ ingestLegacyDm）。owner / proto は呼び出し側。
 * 相手 = 自分が送り手なら p、そうでなければ送り手。自分が当事者でない・署名者が NIP-04 を使えなければ null。
 * 復号の例外は DmDecryptError（decryptErrorIsInvalid の扱いは unwrapGiftWrap と同じ）。
 */
export async function decryptLegacy(
  signer: Signer,
  event: NostrEvent,
  me: string,
  opts: { decryptErrorIsInvalid: boolean },
): Promise<Omit<DmMessageRow, "owner" | "proto"> | null> {
  if (event.kind !== 4) return null;
  const p = event.tags.find((t) => t[0] === "p" && t.length >= 2)?.[1];
  let peer: string;
  if (event.pubkey === me) {
    if (p === undefined) return null;
    peer = p;
  } else {
    if (p !== me) return null;
    peer = event.pubkey;
  }
  const cipher = signer.nip04;
  if (!cipher) return null;
  const content = await decryptWith(() => cipher.decrypt(peer, event.content), opts);
  return { id: event.id, peer, sender: event.pubkey, content, tags: event.tags, createdAt: event.created_at };
}
