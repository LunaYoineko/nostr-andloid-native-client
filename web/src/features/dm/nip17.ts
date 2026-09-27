import { getEventHash, type NostrEvent, verifyEvent } from "nostr-tools/pure";
import type { DmMessageRow } from "../../db/schema";
import type { Signer } from "../../nostr/signer";
import { VaultError } from "../../signer/webKeyVault";

/** gift wrap の中身（kind:14。署名は無い） */
export type Rumor = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
};

/**
 * DM を読めなかった理由。signer = 署名者の拒否・無応答かもしれない（記録せず次の起動でやり直す）、
 * invalid = 中身が壊れていて何度やっても読めない
 */
export type DmDecryptFailure = "signer" | "invalid";

export class DmDecryptError extends Error {
  readonly reason: DmDecryptFailure;

  // 復号した中身・鍵は入れない（メッセージは理由だけ）
  constructor(reason: DmDecryptFailure) {
    super(reason);
    this.name = "DmDecryptError";
    this.reason = reason;
  }
}

/**
 * 署名者での復号。例外は decryptErrorIsInvalid なら invalid（nsec: 何度やっても同じ = 壊れている）、
 * そうでなければ signer（NIP-07 / NIP-46: 拒否・無応答かもしれない）。
 * nsec でも鍵の保管庫の失敗（VaultError: 鍵が無い・保管先が使えない）は中身のせいではないので signer
 * （一時停止 → 再開でやり直す）
 */
export async function decryptWith(
  decrypt: () => Promise<string>,
  opts: { decryptErrorIsInvalid: boolean },
): Promise<string> {
  try {
    return await decrypt();
  } catch (e) {
    throw new DmDecryptError(opts.decryptErrorIsInvalid && !(e instanceof VaultError) ? "invalid" : "signer");
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTags(value: unknown): value is string[][] {
  return (
    Array.isArray(value) && value.every((t) => Array.isArray(t) && t.every((v) => typeof v === "string"))
  );
}

/** 署名の正しい kind:13（seal）。形が違う・署名が不正なら null */
function asSeal(value: unknown): NostrEvent | null {
  if (!isRecord(value) || value.kind !== 13) return null;
  try {
    return verifyEvent(value as NostrEvent) ? (value as NostrEvent) : null;
  } catch {
    // 形が壊れていて id を計算できない
    return null;
  }
}

/**
 * gift wrap（kind:1059）を自分の鍵で 2 段復号して rumor（kind:14）を取り出す（ネイティブ Nip17.unwrap）。
 * ネイティブと違い seal の署名と rumor の id も検証する。読めなければ DmDecryptError。
 */
export async function unwrapGiftWrap(
  signer: Signer,
  wrap: NostrEvent,
  opts: { decryptErrorIsInvalid: boolean },
): Promise<Rumor> {
  const cipher = signer.nip44;
  if (wrap.kind !== 1059 || !cipher) throw new DmDecryptError("invalid");

  const sealJson = await decryptWith(() => cipher.decrypt(wrap.pubkey, wrap.content), opts);
  const seal = asSeal(parseJson(sealJson));
  if (!seal) throw new DmDecryptError("invalid");

  const rumorJson = await decryptWith(() => cipher.decrypt(seal.pubkey, seal.content), opts);
  const value = parseJson(rumorJson);
  if (
    !isRecord(value) ||
    value.kind !== 14 ||
    value.pubkey !== seal.pubkey ||
    !isTags(value.tags) ||
    typeof value.content !== "string" ||
    typeof value.created_at !== "number" ||
    !Number.isInteger(value.created_at)
  ) {
    throw new DmDecryptError("invalid");
  }
  const rumor = {
    pubkey: seal.pubkey,
    created_at: value.created_at,
    kind: 14,
    tags: value.tags,
    content: value.content,
  };
  let id: string;
  try {
    id = getEventHash(rumor);
  } catch {
    throw new DmDecryptError("invalid");
  }
  if (value.id !== undefined && value.id !== id) throw new DmDecryptError("invalid");
  return { id, ...rumor };
}

/**
 * rumor → 会話の 1 件（owner / proto は呼び出し側）。宛先（p）がちょうど 1 人のものだけ（グループ DM は M1 では出さない）。
 * 自分が送った分は宛先が相手（自分宛てのメモなら自分）、受けた分は送り手が相手。自分が当事者でなければ null。
 */
export function dmFromRumor(rumor: Rumor, me: string): Omit<DmMessageRow, "owner" | "proto"> | null {
  const recipients = [...new Set(rumor.tags.filter((t) => t[0] === "p" && t.length >= 2).map((t) => t[1]))];
  if (recipients.length !== 1) return null;
  let peer: string;
  if (rumor.pubkey === me) {
    peer = recipients[0];
  } else {
    if (recipients[0] !== me) return null;
    peer = rumor.pubkey;
  }
  return {
    id: rumor.id,
    peer,
    sender: rumor.pubkey,
    content: rumor.content,
    tags: rumor.tags,
    createdAt: rumor.created_at,
  };
}
