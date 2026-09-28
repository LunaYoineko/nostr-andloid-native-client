import type { EventTemplate, NostrEvent } from "nostr-tools/pure";
import { unixNow } from "../../lib/time";
import { refetchOwnReplaceable } from "../../nostr/ownReplaceable";
import { PublishError, type PublishFailure, publishEvent } from "../../nostr/publish";
import { PINNED_MAX, pinnedHashtagsFrom } from "../compose/storage";

/** kind:30015 の d タグ（ネイティブ PinnedHashtags.D_TAG） */
export const PINNED_D_TAG = "pinned";

/**
 * 手入力を PinnedHashtags.normalize と同じルールで正規化する（前後の空白・先頭 # を除き小文字）。
 * 空、または文字・数字・_ 以外を含むなら null。
 */
export function normalizeHashtag(raw: string): string | null {
  const value = raw.trim().replace(/^#/, "").trim().toLowerCase();
  if (value === "") return null;
  return /^[\p{L}\p{Nd}_]+$/u.test(value) ? value : null;
}

/** ピン留めの上限に達したときの文言（ネイティブ tag_pin_limit_fmt） */
export function pinLimitMessage(max = PINNED_MAX): string {
  return `ピン留めは${max}件までです。整理画面で整理してください。`;
}

/**
 * 発行する kind:30015（d=pinned）。取り直した版（base）の d / t 以外のタグと content はそのまま残し、
 * t タグだけ tags（表示順）で置き換える。PINNED_MAX を超える分は切り詰める。
 */
export function buildPinnedHashtagsTemplate(
  base: NostrEvent | null,
  tags: readonly string[],
  nowSec: number,
): EventTemplate {
  const others = (base?.tags ?? []).filter((t) => t[0] !== "d" && t[0] !== "t");
  const trimmed = tags.slice(0, PINNED_MAX);
  return {
    kind: 30015,
    content: base?.content ?? "",
    tags: [["d", PINNED_D_TAG], ...trimmed.map((t) => ["t", t]), ...others],
    // 同じ秒に続けて保存しても、置換可能イベントの新旧が崩れないように
    created_at: Math.max(nowSec, (base?.created_at ?? 0) + 1),
  };
}

/**
 * no-pinned-list = 直前の取り直しでどのリレーからも応答が無かった（古い版で上書きしうるので止めた）。
 * stale = 編集を始めた時点の版と、取り直した最新版が違う（別の端末・クライアントでの変更を消すので止めた）。
 */
export type PinnedHashtagsFailure = "no-pinned-list" | "stale" | PublishFailure;

export class PinnedHashtagsError extends Error {
  readonly reason: PinnedHashtagsFailure;

  constructor(reason: PinnedHashtagsFailure, options?: ErrorOptions) {
    super(`pinned hashtags failed: ${reason}`, options);
    this.name = "PinnedHashtagsError";
    this.reason = reason;
  }
}

async function refetchPinned(me: string): Promise<NostrEvent | null> {
  try {
    return await refetchOwnReplaceable(me, 30015, PINNED_D_TAG);
  } catch (e) {
    throw new PinnedHashtagsError("no-pinned-list", { cause: e });
  }
}

/**
 * ピン留めを保存する（整理画面の「保存」）。#478 の規則: 発行の直前に自分の kind:30015(d=pinned) を
 * read ∪ write ∪ インデクサから取り直し、どのリレーからも応答が無ければ発行しない（no-pinned-list）。
 * 編集を始めた時点の版（basedOnId）と取り直した最新版の id が違えば発行しない（stale）。
 */
export async function publishPinnedHashtags(
  me: string,
  tags: readonly string[],
  basedOnId: string | null,
): Promise<void> {
  const base = await refetchPinned(me);
  if ((base?.id ?? null) !== basedOnId) throw new PinnedHashtagsError("stale");
  const template = buildPinnedHashtagsTemplate(base, tags, unixNow());
  try {
    await publishEvent(template);
  } catch (e) {
    if (e instanceof PublishError) throw new PinnedHashtagsError(e.reason, { cause: e });
    throw e;
  }
}

export type ToggleResult = "done" | "noop" | "limit";

/**
 * 1 件だけピン留め・解除する（投稿シートのタグチップの長押し / 右クリック）。#478 の規則: 取り直した
 * 最新版に対して足す・外すだけを行う（basedOnId の照合はしない）。取り直した最新版で既に pin の状態と
 * 同じなら noop（別の端末で同じ操作が済んでいた場合）。ピン留めで既に PINNED_MAX 件なら limit（発行しない）。
 */
export async function togglePinnedHashtag(me: string, tag: string, pin: boolean): Promise<ToggleResult> {
  const base = await refetchPinned(me);
  const current = pinnedHashtagsFrom(base ?? undefined);
  const has = current.includes(tag);
  if (has === pin) return "noop";
  if (pin && current.length >= PINNED_MAX) return "limit";
  const next = pin ? [...current, tag] : current.filter((t) => t !== tag);
  const template = buildPinnedHashtagsTemplate(base, next, unixNow());
  try {
    await publishEvent(template);
  } catch (e) {
    if (e instanceof PublishError) throw new PinnedHashtagsError(e.reason, { cause: e });
    throw e;
  }
  return "done";
}
