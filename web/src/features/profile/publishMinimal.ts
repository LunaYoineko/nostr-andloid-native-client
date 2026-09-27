/**
 * 署名して送る（#458 で publish queue に差し替える境界）。
 * 本来の置き場は src/nostr/publish.ts だが、#458 が同じファイルを作るため衝突を避けて #457 ではここに置く。
 * #458 のマージ時に src/nostr/publish.ts の signAndPublish / PublishError へ差し替え、このファイルは消す。
 * #458 で未送信の保存・再送・トーストを持つ queue 実装に差し替える。呼び出し側は
 * `signAndPublish(template): Promise<NostrEvent>` と `PublishError` だけに依存する。
 */
import type { PublishResponse } from "applesauce-relay/types";
import type { EventTemplate, NostrEvent } from "nostr-tools/pure";
import { pool, relays } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { currentSigner, useSession } from "../../signer/session";

/** リレーの OK を待つ時間 */
export const PUBLISH_TIMEOUT_MS = 10_000;

/**
 * 送信失敗の理由。no-signer = 未ログイン、sign-failed = 署名の拒否・失敗、
 * pubkey-mismatch = ログイン中と別の鍵で署名された、not-accepted = どのリレーも OK を返さなかった
 */
export type PublishFailure = "no-signer" | "sign-failed" | "pubkey-mismatch" | "not-accepted";

export class PublishError extends Error {
  readonly reason: PublishFailure;

  constructor(reason: PublishFailure, options?: ErrorOptions) {
    super(`publish failed: ${reason}`, options);
    this.name = "PublishError";
    this.reason = reason;
  }
}

/**
 * template に署名し、設定リレーへ送る。1 つ以上のリレーが OK を返したら EventStore へ入れて署名済みイベントを返す。
 * 失敗は PublishError（ストアも IndexedDB も変えない）。
 */
export async function signAndPublish(template: EventTemplate): Promise<NostrEvent> {
  const me = useSession.getState().pubkey;
  const signer = currentSigner();
  if (!me || !signer) throw new PublishError("no-signer");

  let signed: NostrEvent;
  try {
    signed = await signer.signEvent(template);
  } catch (e) {
    throw new PublishError("sign-failed", { cause: e });
  }
  if (signed.pubkey !== me) throw new PublishError("pubkey-mismatch");

  let results: PublishResponse[];
  try {
    results = await pool.publish([...relays], signed, { timeout: PUBLISH_TIMEOUT_MS });
  } catch (e) {
    throw new PublishError("not-accepted", { cause: e });
  }
  if (!results.some((r) => r.ok)) throw new PublishError("not-accepted");

  // OK を受けてからストアへ入れる。#477 の addVerified（kind:5 を検証してから入れる口）は無い前提で直接入れる。
  // ここを通るのは自分が署名したイベント（#457 では kind:3 だけ）で、kind:5 は扱わない
  eventStore.add(signed);
  return signed;
}
