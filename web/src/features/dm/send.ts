import type { NostrEvent } from "nostr-tools/pure";
import type { DmMessageRow } from "../../db/schema";
import { unixNow } from "../../lib/time";
import { relayPrefsOf } from "../../nostr/outbox";
import { readRelays, writeRelays } from "../../nostr/pool";
import { enqueueSigned, publishEvent } from "../../nostr/publish";
import type { Signer } from "../../nostr/signer";
import { currentSigner, useSession } from "../../signer/session";
import { isNip04OnlyPeer, ownDmRelaysOrSeed, peerDmRelays } from "./dmRelays";
import { recordSentDm, removeSentDm } from "./dmService";
import { useDm } from "./dmStore";
import { buildRumor, wrapGiftWrap } from "./nip17";

/**
 * DM の送信結果（ネイティブ DmSendResult）。sent-no-peer-relays = 相手が kind:10050 を公開しておらず
 * 送り先を推測した（届かないかもしれない）。no-nip44 / no-nip04 = 署名者がその暗号を使えず送らなかった、
 * no-relays = 送り先のリレーが 1 つも無い。受理の確認は送信キュー（未送信・unconfirmed$）に任せる
 */
export type DmSendResult = "sent" | "sent-no-peer-relays" | "failed" | "no-nip44" | "no-nip04" | "no-relays";

/** 相手の kind:10002 の read リレー */
function readRelaysOf(pubkey: string): string[] {
  return relayPrefsOf(pubkey)
    .filter((p) => p.read)
    .map((p) => p.url);
}

/**
 * 相手へ DM を送る（ネイティブ sendDm）。NIP-17 を優先し、相手が kind:10050 を公開しておらず
 * NIP-04 の DM しか送ってきていないときだけ NIP-04（kind:4）で送る。本文・鍵はログに出さない。
 * [replyTo] があれば kind:14 の rumor に NIP-10 の reply マーカー付き #e を添える（#589。NIP-04 の
 * kind:4 は rumor ではないため対象外）
 */
export async function sendDm(
  peer: string,
  text: string,
  replyTo: NostrEvent | null = null,
): Promise<DmSendResult> {
  const me = useSession.getState().pubkey;
  const signer = currentSigner();
  if (me === null || signer === null || text.trim() === "") return "failed";

  let peerRelays: string[];
  try {
    peerRelays = await peerDmRelays(peer);
  } catch {
    return "failed";
  }
  if (peerRelays.length === 0 && isNip04OnlyPeer(Object.values(useDm.getState().messages), peer)) {
    return sendNip04(me, signer, peer, text);
  }
  return sendNip17(me, signer, peer, text, peerRelays, replyTo);
}

async function sendNip04(me: string, signer: Signer, peer: string, text: string): Promise<DmSendResult> {
  const cipher = signer.nip04;
  if (!cipher) return "no-nip04";
  const tags = [["p", peer]];
  let signed: NostrEvent;
  try {
    const content = await cipher.encrypt(peer, text);
    const targets = [...new Set([...writeRelays(), ...readRelaysOf(peer)])];
    signed = await publishEvent({ kind: 4, content, tags }, { relays: targets });
  } catch {
    return "failed";
  }
  await recordSentDm(
    {
      owner: me,
      id: signed.id,
      peer,
      sender: me,
      content: text,
      tags,
      createdAt: signed.created_at,
      proto: "nip04",
    },
    [signed.id],
  );
  return "sent";
}

async function sendNip17(
  me: string,
  signer: Signer,
  peer: string,
  text: string,
  peerRelays: string[],
  replyTo: NostrEvent | null,
): Promise<DmSendResult> {
  if (!signer.nip44) return "no-nip44";
  const rumor = buildRumor(me, peer, text, unixNow(), replyTo);
  let shown = false;
  let toPeer: NostrEvent;
  let toSelf: NostrEvent | null;
  let peerTargets: string[];
  let selfTargets: string[];
  try {
    toPeer = await wrapGiftWrap(signer, rumor, peer);
    toSelf = peer === me ? null : await wrapGiftWrap(signer, rumor, me);

    // 楽観表示（送った gift wrap は処理済みにして、自分宛ての控えが返ってきても復号しない）
    const row: DmMessageRow = {
      owner: me,
      id: rumor.id,
      peer,
      sender: me,
      content: text,
      tags: rumor.tags,
      createdAt: rumor.created_at,
      proto: "nip17",
    };
    shown = true;
    await recordSentDm(row, toSelf ? [toPeer.id, toSelf.id] : [toPeer.id]);

    // 送り先: 相手の kind:10050。無ければ自分の read リレー + 相手の read リレー（ネイティブより配達率を優先）
    const fallback = [...new Set([...readRelays(), ...readRelaysOf(peer)])];
    peerTargets = peerRelays.length > 0 ? peerRelays : fallback;
    const own = await ownDmRelaysOrSeed(me);
    selfTargets = own.length > 0 ? own : [...readRelays()];
    if (peerTargets.length === 0) {
      await removeSentDm(me, rumor.id);
      return "no-relays";
    }
  } catch {
    if (shown) await removeSentDm(me, rumor.id);
    return "failed";
  }

  try {
    await enqueueSigned(toPeer, { relays: peerTargets, refId: rumor.id, notify: true });
  } catch {
    // まだ何も積んでいない
    await removeSentDm(me, rumor.id);
    return "failed";
  }
  try {
    if (toSelf) await enqueueSigned(toSelf, { relays: selfTargets, refId: null, notify: false });
  } catch {
    // 相手宛ては積んだ（再送で届きうる）ので表示は消さない
    return "failed";
  }
  return peerRelays.length > 0 ? "sent" : "sent-no-peer-relays";
}
