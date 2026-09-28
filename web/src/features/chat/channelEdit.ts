import type { Filter } from "applesauce-core/helpers/filter";
import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { useMemo } from "react";
import type { Subscription } from "rxjs";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { unixNow } from "../../lib/time";
import { OWN_REPLACEABLE_REFETCH_MS, OwnReplaceableUnreachableError } from "../../nostr/ownReplaceable";
import { readRelays, requestOnce, subscribe, writeRelays } from "../../nostr/pool";
import { type EventDraft, PublishError, type PublishFailure, publishEvent } from "../../nostr/publish";
import { eventStore } from "../../nostr/store";

/**
 * NIP-28 チャンネルの作成（kind:40）・編集（kind:41）。ネイティブ EventRepository.createChannel /
 * updateChannel の Web 版（#538）。編集には #478 の規則を足す: 発行の直前に自分の最新版を取り直し、
 * どのリレーからも応答が無ければ発行しない・編集を始めた時点の版と食い違えば発行しない。
 * kind:41 は NIP-01 の置換可能イベントではないため ownReplaceable.ts の getReplaceable は使えず、
 * 自分の kind:41 の最新版（無ければ kind:40）を timeline から自前で選ぶ。
 */

export type ChannelFields = { name: string; about: string; picture: string };

const NO_EVENTS: NostrEvent[] = [];

/** kind:40 / 41 の content を JSON オブジェクトとして読む。読めなければ null */
function contentObject(event: NostrEvent | null): Record<string, unknown> | null {
  if (!event) return null;
  try {
    const json: unknown = JSON.parse(event.content);
    return typeof json === "object" && json !== null && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 発行する content（ネイティブ createChannel / updateChannel と同じ: name・about は常に、picture は空でなければ） */
function buildChannelContent(base: Record<string, unknown> | null, fields: ChannelFields): string {
  const json: Record<string, unknown> = { ...(base ?? {}) };
  json.name = fields.name;
  json.about = fields.about;
  if (fields.picture.trim() === "") delete json.picture;
  else json.picture = fields.picture;
  return JSON.stringify(json);
}

/** 作成する kind:40。tags は無し */
export function buildChannelCreateTemplate(fields: ChannelFields, nowSec: number): EventDraft {
  return { kind: 40, content: buildChannelContent(null, fields), tags: [], created_at: nowSec };
}

/**
 * 編集する kind:41。content は取り直した版（base）の JSON を土台に name / about / picture を上書き
 * （relays など未知のキーは保つ）。tags は e タグ（channelId）＋ base の e 以外のタグ（未知タグを保つ）。
 */
export function buildChannelEditTemplate(
  base: NostrEvent | null,
  channelId: string,
  fields: ChannelFields,
  nowSec: number,
): EventDraft {
  const others = (base?.tags ?? []).filter((t) => t[0] !== "e");
  return {
    kind: 41,
    content: buildChannelContent(contentObject(base), fields),
    tags: [["e", channelId], ...others],
    // 同じ秒に続けて保存しても、新旧の判定（created_at）が崩れないように
    created_at: Math.max(nowSec, (base?.created_at ?? 0) + 1),
  };
}

/** 自分の kind:41 の最新版（ストアの今の中身。取り直しはしない）。無ければそのチャンネルの kind:40 */
export function latestOwnChannelMeta(me: string, channelId: string): NostrEvent | null {
  const edits = eventStore.getTimeline({ kinds: [41], authors: [me], "#e": [channelId] });
  if (edits.length > 0) return edits[0];
  const created = eventStore.getEvent(channelId);
  return created && created.kind === 40 ? created : null;
}

/** latestOwnChannelMeta のストア変化に追随する版（編集ダイアログの表示用） */
export function useOwnChannelMeta(me: string | null, channelId: string | null): NostrEvent | null {
  const edits =
    use$(
      () =>
        me && channelId ? eventStore.timeline({ kinds: [41], authors: [me], "#e": [channelId] }) : undefined,
      [me, channelId],
    ) ?? NO_EVENTS;
  const created =
    use$(
      () => (channelId ? eventStore.timeline({ kinds: [40], ids: [channelId] }) : undefined),
      [channelId],
    ) ?? NO_EVENTS;
  return edits[0] ?? created[0] ?? null;
}

/**
 * 発行の直前に自分の kind:40（ids=channelId）と kind:41（authors:[me], #e:[channelId]）を
 * read ∪ write ∪ インデクサ ∪ チャンネルの relays へ requestOnce（5 秒）で取り直す（#478 の規則）。
 * どのリレーからも応答が無ければ OwnReplaceableUnreachableError（呼び出し側は発行しない）。
 */
export async function refetchOwnChannelMeta(
  me: string,
  channelId: string,
  channelRelays: readonly string[],
): Promise<NostrEvent | null> {
  const filters: Filter[] = [
    { kinds: [40], ids: [channelId] },
    { kinds: [41], authors: [me], "#e": [channelId] },
  ];
  const relays = [...new Set([...readRelays(), ...writeRelays(), ...INDEXER_RELAYS, ...channelRelays])];
  const reached = await new Promise<boolean>((resolve) => {
    requestOnce(relays, filters, OWN_REPLACEABLE_REFETCH_MS).subscribe({
      complete: () => resolve(true),
      error: () => resolve(false),
    });
  });
  if (!reached) throw new OwnReplaceableUnreachableError(41);
  return latestOwnChannelMeta(me, channelId);
}

/**
 * unreachable = 直前の取り直しでどのリレーからも応答が無かった（古い版で上書きしうるので止めた）。
 * stale = 編集を始めた時点の版と、取り直した最新版が違う（別の端末・クライアントでの変更を消すので止めた）。
 */
export type ChannelEditFailure = "unreachable" | "stale" | PublishFailure;

export class ChannelEditError extends Error {
  readonly reason: ChannelEditFailure;

  constructor(reason: ChannelEditFailure, options?: ErrorOptions) {
    super(`channel edit failed: ${reason}`, options);
    this.name = "ChannelEditError";
    this.reason = reason;
  }
}

/** チャンネルを新規作成する（kind:40）。write ∪ インデクサへ送る */
export async function publishNewChannel(fields: ChannelFields): Promise<NostrEvent> {
  try {
    return await publishEvent(buildChannelCreateTemplate(fields, unixNow()), {
      relays: [...new Set([...writeRelays(), ...INDEXER_RELAYS])],
    });
  } catch (e) {
    if (e instanceof PublishError) throw new ChannelEditError(e.reason, { cause: e });
    throw e;
  }
}

/**
 * 自分のチャンネルを編集する（kind:41）。#478 の規則で直前に取り直し、どのリレーからも応答が無ければ
 * unreachable、編集を始めた時点の版（basedOnId）と食い違えば stale。write ∪ インデクサ ∪ チャンネルの
 * relays へ送る。
 */
export async function publishChannelEdit(a: {
  me: string;
  channelId: string;
  channelRelays: readonly string[];
  fields: ChannelFields;
  basedOnId: string | null;
}): Promise<NostrEvent> {
  let base: NostrEvent | null;
  try {
    base = await refetchOwnChannelMeta(a.me, a.channelId, a.channelRelays);
  } catch (e) {
    if (e instanceof OwnReplaceableUnreachableError) throw new ChannelEditError("unreachable", { cause: e });
    throw e;
  }
  if ((base?.id ?? null) !== a.basedOnId) throw new ChannelEditError("stale");
  try {
    return await publishEvent(buildChannelEditTemplate(base, a.channelId, a.fields, unixNow()), {
      relays: [...new Set([...writeRelays(), ...INDEXER_RELAYS, ...a.channelRelays])],
    });
  } catch (e) {
    if (e instanceof PublishError) throw new ChannelEditError(e.reason, { cause: e });
    throw e;
  }
}

// ---- 自分が作ったスレッドの判定（一覧の ✏️ の出し分け。ネイティブ myChannelIdsFlow） ----

let myChannels: { me: string; sub: Subscription } | null = null;

/** 自分の kind:40 を読み relay へ張ったままにする（一覧を表示したら 1 度呼ぶ） */
export function ensureMyChannelsSubscribed(me: string): void {
  if (myChannels?.me === me) return;
  myChannels?.sub.unsubscribe();
  myChannels = { me, sub: subscribe({ kinds: [40], authors: [me], limit: 500 }).subscribe() };
}

/** 自分が作成した kind:40 の id 一覧（✏️ を出す対象） */
export function useMyChannelIds(me: string | null): ReadonlySet<string> {
  const events =
    use$(() => (me ? eventStore.timeline({ kinds: [40], authors: [me] }) : undefined), [me]) ?? NO_EVENTS;
  return useMemo(() => new Set(events.map((e) => e.id)), [events]);
}

/** テスト専用: 自分のチャンネルの購読状態を戻す */
export function resetMyChannelsForTest(): void {
  myChannels?.sub.unsubscribe();
  myChannels = null;
}
