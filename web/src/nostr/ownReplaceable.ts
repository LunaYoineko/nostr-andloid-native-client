import type { Filter } from "applesauce-core/helpers/filter";
import type { NostrEvent } from "nostr-tools/pure";
import { INDEXER_RELAYS } from "../lib/columnRequest";
import { readRelays, requestOnce, writeRelays } from "./pool";
import { eventStore } from "./store";

/** 発行の直前に自分の置換可能イベントを取り直す待ち時間（フォローの kind:3 と同じ） */
export const OWN_REPLACEABLE_REFETCH_MS = 5_000;

/** 取り直しでどのリレーからも応答が無かった（手元の版が古い可能性があり、発行すると最新の内容を消しうる） */
export class OwnReplaceableUnreachableError extends Error {
  readonly kind: number;

  constructor(kind: number) {
    super(`own replaceable unreachable: kind ${kind}`);
    this.name = "OwnReplaceableUnreachableError";
    this.kind = kind;
  }
}

/**
 * 自分の置換可能イベント（kind。30000 番台は d タグ = identifier）を read ∪ write ∪ インデクサから取り直し、
 * ストアの最新版を返す（無ければ null）。どのリレーからも応答が無ければ OwnReplaceableUnreachableError
 * （#478 の規則。呼び出し側は発行しない）。
 */
export async function refetchOwnReplaceable(
  me: string,
  kind: number,
  identifier?: string,
): Promise<NostrEvent | null> {
  const filter: Filter = { kinds: [kind], authors: [me], limit: 1 };
  if (identifier !== undefined) filter["#d"] = [identifier];
  // complete = 少なくとも 1 つのリレーが応答した、error = どこからも応答が無かった
  const reached = await new Promise<boolean>((resolve) => {
    requestOnce(
      [...new Set([...readRelays(), ...writeRelays(), ...INDEXER_RELAYS])],
      [filter],
      OWN_REPLACEABLE_REFETCH_MS,
    ).subscribe({ complete: () => resolve(true), error: () => resolve(false) });
  });
  if (!reached) throw new OwnReplaceableUnreachableError(kind);
  return eventStore.getReplaceable(kind, me, identifier) ?? null;
}
