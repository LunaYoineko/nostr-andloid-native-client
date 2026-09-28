import type { EventTemplate, NostrEvent } from "nostr-tools/pure";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { unixNow } from "../../lib/time";
import { OwnReplaceableUnreachableError, refetchOwnReplaceable } from "../../nostr/ownReplaceable";
import { writeRelays } from "../../nostr/pool";
import { PublishError, type PublishFailure, publishEvent } from "../../nostr/publish";
import { parseRelayInput } from "./relayList";

/**
 * no-relay-list = 発行直前の取り直しでどのリレーからも応答が無かった（古い版で上書きしうるので止めた）。
 * stale = 編集を始めた時点の版と、取り直した最新版が違う（別の端末・クライアントでの変更をそのまま
 * 発行すると消しうるので止めた。relayList.ts の RelayListError と同じ規則）。
 */
export type DmRelayListFailure = "no-relay-list" | "stale" | PublishFailure;

export class DmRelayListError extends Error {
  readonly reason: DmRelayListFailure;

  constructor(reason: DmRelayListFailure, options?: ErrorOptions) {
    super(`dm relay list failed: ${reason}`, options);
    this.name = "DmRelayListError";
    this.reason = reason;
  }
}

/** 「現在の受信リレーから作成」に入れる read リレーの数（ネイティブ・dmRelays.ts の自動作成と同じ） */
export const DM_RELAY_SEED_COUNT = 4;

/** read リレーの先頭 DM_RELAY_SEED_COUNT 件（wss:// だけ、正規化して重複除去） */
export function dmRelaysFromReads(reads: readonly string[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const raw of reads) {
    const url = parseRelayInput(raw);
    if (url === null || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= DM_RELAY_SEED_COUNT) break;
  }
  return urls;
}

/**
 * 発行する kind:10050。取り直した版（base）の relay 以外のタグ（未知タグ）と content はそのまま残し、
 * relay タグだけを urls（正規化して重複除去）で置き換える（relayList.ts の buildRelayListTemplate と同じ考え方）。
 */
export function buildDmRelayListTemplate(
  base: NostrEvent | null,
  urls: readonly string[],
  nowSec: number,
): EventTemplate {
  const clean = [...new Set(urls)];
  const others = (base?.tags ?? []).filter((t) => t[0] !== "relay");
  return {
    kind: 10050,
    content: base?.content ?? "",
    tags: [...clean.map((url) => ["relay", url]), ...others],
    // 同じ秒に続けて保存しても、置換可能イベントの新旧が崩れないように
    created_at: Math.max(nowSec, (base?.created_at ?? 0) + 1),
  };
}

/**
 * DM の受信リレー（kind:10050）を発行する（ネイティブ publishDmRelays。#478 の規則を足したもの）。
 * 発行の直前に自分の最新版を read ∪ write ∪ インデクサから取り直し（refetchOwnReplaceable）、
 * どのリレーからも応答が無ければ DmRelayListError("no-relay-list")。編集を始めた時点の版の id
 * （basedOnId。無ければ null）と取り直した最新版の id が違えば DmRelayListError("stale")。
 * 送り先は write リレー ∪ INDEXER_RELAYS ∪ 新しい DM リレー（dmRelays.ts の自動作成と同じ）。
 * 発行できた版は publishEvent が EventStore へ入れるので、dmRelays.ts はそのまま最新を読める。
 */
export async function publishDmRelayList(
  me: string,
  urls: readonly string[],
  basedOnId: string | null,
): Promise<void> {
  let base: NostrEvent | null;
  try {
    base = await refetchOwnReplaceable(me, 10050);
  } catch (e) {
    if (e instanceof OwnReplaceableUnreachableError)
      throw new DmRelayListError("no-relay-list", { cause: e });
    throw e;
  }
  if ((base?.id ?? null) !== basedOnId) throw new DmRelayListError("stale");

  const template = buildDmRelayListTemplate(base, urls, unixNow());
  const targets = [...new Set([...writeRelays(), ...INDEXER_RELAYS, ...urls])];
  try {
    await publishEvent(template, { relays: targets });
  } catch (e) {
    if (e instanceof PublishError) throw new DmRelayListError(e.reason, { cause: e });
    throw e;
  }
}
