import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { unixNow } from "../../lib/time";
import { readRelays, requestOnce, writeRelays } from "../../nostr/pool";
import { PublishError, type PublishFailure, publishEvent } from "../../nostr/publish";
import { eventStore } from "../../nostr/store";
import { buildContactsTemplate } from "./contacts";

/** フォロー操作の直前に自分の kind:3 を取り直す待ち時間 */
export const OWN_CONTACTS_TIMEOUT_MS = 5_000;

/** no-contacts = 直前の取り直しでどのリレーからも応答が無かった（手元の版が古い可能性があり、発行するとリストを消しうるので止めた） */
export type FollowFailure = "no-contacts" | PublishFailure;

export class FollowError extends Error {
  readonly reason: FollowFailure;

  constructor(reason: FollowFailure, options?: ErrorOptions) {
    super(`follow failed: ${reason}`, options);
    this.name = "FollowError";
    this.reason = reason;
  }
}

/**
 * target をフォロー / 解除する（kind:3 を発行する）。直前に自分の kind:3 をリレーとインデクサから取り直し、
 * 既存のタグと content を保ったまま p を足す / 引く。変える必要が無ければ "noop"。
 * どのリレーからも応答が無ければ、手元に kind:3 があっても発行せず FollowError("no-contacts")
 * （未取得のまま発行して 1 人だけのリストで上書きする・古い版で上書きするのを防ぐ）。
 * 発行は送信キュー（publishEvent）を通す: 署名できた時点でストアに入り、リレーの受理は待たない
 * （届かなければ未送信として残り再送される）。署名の失敗は同じ reason の FollowError。
 */
export async function toggleFollow(
  me: string,
  target: string,
  action: "follow" | "unfollow",
): Promise<"done" | "noop"> {
  // complete = 少なくとも 1 つのリレーが応答した、error = どこからも応答が無かった
  const reached = await new Promise<boolean>((resolve) => {
    requestOnce(
      [...new Set([...readRelays(), ...writeRelays(), ...INDEXER_RELAYS])],
      [{ kinds: [3], authors: [me], limit: 1 }],
      OWN_CONTACTS_TIMEOUT_MS,
    ).subscribe({ complete: () => resolve(true), error: () => resolve(false) });
  });

  if (!reached) throw new FollowError("no-contacts");
  const base = eventStore.getReplaceable(3, me) ?? null;

  const template = buildContactsTemplate(base, target, action, unixNow());
  if (template === null) return "noop";

  try {
    await publishEvent(template);
  } catch (e) {
    if (e instanceof PublishError) throw new FollowError(e.reason, { cause: e });
    throw e;
  }
  return "done";
}
