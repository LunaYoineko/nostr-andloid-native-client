import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { unixNow } from "../../lib/time";
import { relays, requestOnce } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { buildContactsTemplate } from "./contacts";
import { PublishError, type PublishFailure, signAndPublish } from "./publishMinimal";

/** フォロー操作の直前に自分の kind:3 を取り直す待ち時間 */
export const OWN_CONTACTS_TIMEOUT_MS = 5_000;

/** no-contacts = 自分の kind:3 がどこからも取れず手元にも無い（発行するとリストを消しうるので止めた） */
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
 * 自分の kind:3 が手元に無く、どのリレーからも応答が無ければ発行せず FollowError("no-contacts")
 * （未取得のまま発行して 1 人だけのリストで上書きするのを防ぐ）。送信の失敗は同じ reason の FollowError。
 */
export async function toggleFollow(
  me: string,
  target: string,
  action: "follow" | "unfollow",
): Promise<"done" | "noop"> {
  // complete = 少なくとも 1 つのリレーが応答した、error = どこからも応答が無かった
  const reached = await new Promise<boolean>((resolve) => {
    requestOnce(
      [...new Set([...relays, ...INDEXER_RELAYS])],
      [{ kinds: [3], authors: [me], limit: 1 }],
      OWN_CONTACTS_TIMEOUT_MS,
    ).subscribe({ complete: () => resolve(true), error: () => resolve(false) });
  });

  const base = eventStore.getReplaceable(3, me) ?? null;
  if (base === null && !reached) throw new FollowError("no-contacts");

  const template = buildContactsTemplate(base, target, action, unixNow());
  if (template === null) return "noop";

  try {
    await signAndPublish(template);
  } catch (e) {
    if (e instanceof PublishError) throw new FollowError(e.reason, { cause: e });
    throw e;
  }
  return "done";
}
