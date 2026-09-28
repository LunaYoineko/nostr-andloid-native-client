import type { Filter } from "applesauce-core/helpers/filter";
import { normalizeURL } from "applesauce-core/helpers/url";
import type { NostrEvent } from "nostr-tools/pure";
import type { DmMessageRow } from "../../db/schema";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { writeRelaysOf } from "../../nostr/outbox";
import { readRelays, requestOnce, writeRelays } from "../../nostr/pool";
import { publishEvent } from "../../nostr/publish";
import { eventStore } from "../../nostr/store";

/** 相手の kind:10050 が手元に無いとき、取りに行って待つ時間（ネイティブ fetchDmRelaysFor） */
export const PEER_DMRELAY_WAIT_MS = 2_500;
/** 自分の kind:10050 を作る直前に取り直す待ち時間（kind:3 / 10002 / 10000 と同じ） */
export const OWN_DMRELAY_REFETCH_MS = 5_000;
/** 自分の kind:10050 を作るときに入れる read リレーの数（ネイティブ myDmRelaysOrSeed） */
const SEED_RELAY_COUNT = 4;

/**
 * kind:10050（DM を受けるリレー）の relay タグ → リレー URL（ネイティブ updateDmRelayList）。
 * Web は ws:// を使えないので wss:// だけ。正規化して重複を除く
 */
export function dmRelaysFromEvent(event: NostrEvent): string[] {
  const urls = new Set<string>();
  for (const tag of event.tags) {
    const value = tag[0] === "relay" ? tag[1] : undefined;
    if (typeof value !== "string" || !value.startsWith("wss://")) continue;
    try {
      new URL(value);
    } catch {
      continue;
    }
    urls.add(normalizeURL(value));
  }
  return [...urls];
}

/** 手元（EventStore）にある pubkey の kind:10050 のリレー。kind:10050 が無ければ null（あって空なら []） */
function storedDmRelays(pubkey: string): string[] | null {
  const event = eventStore.getReplaceable(10050, pubkey);
  return event ? dmRelaysFromEvent(event) : null;
}

/** 1 回だけ取りに行って終わりを待つ。true = 少なくとも 1 つのリレーが応答した、false = どこからも応答が無かった */
function fetchOnce(relays: readonly string[], filters: Filter[], timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    requestOnce([...new Set(relays)], filters, timeoutMs).subscribe({
      complete: () => resolve(true),
      error: () => resolve(false),
    });
  });
}

/**
 * 相手の DM リレー（kind:10050）。手元に無ければ read リレー・インデクサ・相手の write リレーへ問い合わせ、
 * PEER_DMRELAY_WAIT_MS まで待ってから読み直す。無ければ []
 */
export async function peerDmRelays(peer: string): Promise<string[]> {
  const stored = storedDmRelays(peer);
  if (stored && stored.length > 0) return stored;
  await fetchOnce(
    [...readRelays(), ...INDEXER_RELAYS, ...writeRelaysOf(peer)],
    [{ kinds: [10050], authors: [peer], limit: 1 }],
    PEER_DMRELAY_WAIT_MS,
  );
  return storedDmRelays(peer) ?? [];
}

/** 実行中の ownDmRelaysOrSeed（同時に呼ばれたら共有する） */
const ownInFlight = new Map<string, Promise<string[]>>();
/** このセッションで kind:10050 を発行したアカウント → 入れたリレー（2 回目は発行しない） */
const seeded = new Map<string, string[]>();

/**
 * 自分の DM リレー（kind:10050）。無ければ read リレーの先頭 4 つで作って発行する（ネイティブ myDmRelaysOrSeed）。
 * #478: 未取得のまま発行するとリレー上のリストを上書きして消すので、発行の直前に取り直し、
 * どのリレーからも応答が無ければ発行しない・取り直してリストが見つかれば発行しない・手元のリストが空でも発行しない。
 * 発行はセッションで 1 回まで。例外は投げない（使えるリレーが無ければ []）。
 */
export function ownDmRelaysOrSeed(me: string): Promise<string[]> {
  const running = ownInFlight.get(me);
  if (running) return running;
  const promise = ownDmRelaysNow(me)
    .catch(() => [])
    .finally(() => ownInFlight.delete(me));
  ownInFlight.set(me, promise);
  return promise;
}

async function ownDmRelaysNow(me: string): Promise<string[]> {
  // 手元にある（空でもそのまま返す。本人が空にしているかもしれないので上書きしない）
  const stored = storedDmRelays(me);
  if (stored) return stored;
  const published = seeded.get(me);
  if (published) return published;

  // 発行の直前に取り直す。どのリレーからも応答が無ければ発行しない（古い前提で上書きしうる）
  const reached = await fetchOnce(
    [...readRelays(), ...writeRelays(), ...INDEXER_RELAYS],
    [{ kinds: [10050], authors: [me], limit: 1 }],
    OWN_DMRELAY_REFETCH_MS,
  );
  if (!reached) return [];
  // 取り直したら有った（= 送信を押した時点の「無い」と食い違う）ので発行しない
  const fetched = storedDmRelays(me);
  if (fetched) return fetched;

  const seed = [
    ...new Set(
      readRelays()
        .slice(0, SEED_RELAY_COUNT)
        .map((url) => normalizeURL(url)),
    ),
  ];
  if (seed.length === 0) return [];
  try {
    await publishEvent(
      { kind: 10050, content: "", tags: seed.map((url) => ["relay", url]) },
      { relays: [...new Set([...writeRelays(), ...INDEXER_RELAYS, ...seed])] },
    );
    seeded.set(me, seed);
  } catch {
    // 署名の失敗でも、自分宛ての控えの送り先には使える
  }
  return seed;
}

/** 相手が NIP-04 だけを使っている（相手から NIP-04 の DM を受けたことがあり、NIP-17 の DM は 1 件も無い） */
export function isNip04OnlyPeer(messages: Iterable<DmMessageRow>, peer: string): boolean {
  let nip04 = false;
  for (const message of messages) {
    if (message.sender !== peer || message.peer !== peer) continue;
    if (message.proto === "nip17") return false;
    if (message.proto === "nip04") nip04 = true;
  }
  return nip04;
}
