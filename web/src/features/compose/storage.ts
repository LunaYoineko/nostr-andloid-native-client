import { use$ } from "applesauce-react/hooks/use-$";
import type { NostrEvent } from "nostr-tools/pure";
import { useMemo } from "react";
import { discardUnsent } from "../../nostr/publish";
import { eventStore } from "../../nostr/store";
import { hashtagsIn } from "./tags";

// ---- 下書き（新規投稿の 1 枠。ネイティブ KV の compose_draft） ----

export const DRAFT_KEY = "nostrism.compose.draft";

export function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

/** 下書きを保存する。空白だけなら消す */
export function saveDraft(text: string): void {
  try {
    if (text.trim() === "") localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, text);
  } catch {
    // 保存できなくても入力は続けられる
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 同上
  }
}

// ---- 連投の下書き（本文の下書きとは別枠。ネイティブ saveThreadDraft / loadThreadDraft） ----

/** 値は { "edit": <本文がスレッドの何番目か>, "segs": [...] }。本文 1 枠の下書きとは別キー */
export const THREAD_DRAFT_KEY = "nostrism.compose.threadDraft";

export type ThreadDraft = { segs: string[]; edit: number };

/** 積んだ段落と本文の位置を保存する。段落が無ければキーごと消す */
export function saveThreadDraft(segs: readonly string[], edit: number): void {
  try {
    if (segs.length === 0) {
      localStorage.removeItem(THREAD_DRAFT_KEY);
      return;
    }
    localStorage.setItem(THREAD_DRAFT_KEY, JSON.stringify({ edit, segs }));
  } catch {
    // 保存できなくても入力は続けられる
  }
}

/** 保存済みの連投下書き。無い・壊れていれば null（ネイティブ loadThreadDraft と同じく edit は 0〜segs.length に丸める） */
export function loadThreadDraft(): ThreadDraft | null {
  try {
    const raw = localStorage.getItem(THREAD_DRAFT_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const segs = (value as { segs?: unknown }).segs;
    if (!Array.isArray(segs) || segs.length === 0 || !segs.every((s): s is string => typeof s === "string")) {
      return null;
    }
    const editRaw = (value as { edit?: unknown }).edit;
    const edit =
      typeof editRaw === "number" ? Math.min(Math.max(0, Math.trunc(editRaw)), segs.length) : segs.length;
    return { segs, edit };
  } catch {
    return null;
  }
}

export function clearThreadDraft(): void {
  try {
    localStorage.removeItem(THREAD_DRAFT_KEY);
  } catch {
    // 同上
  }
}

// ---- ハッシュタグの使用履歴（ネイティブの used_hashtag） ----

/** 値は [{ "tag": string, "lastUsed": number }]（新しい順） */
export const USED_HASHTAGS_KEY = "nostrism.compose.usedHashtags";
/** Web のみの上限（localStorage を守るため） */
export const USED_HASHTAGS_MAX = 500;

type UsedHashtag = { tag: string; lastUsed: number };

function readUsed(): UsedHashtag[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(USED_HASHTAGS_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (v): v is UsedHashtag =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as UsedHashtag).tag === "string" &&
        typeof (v as UsedHashtag).lastUsed === "number",
    );
  } catch {
    return [];
  }
}

/** 使ったハッシュタグ（新しい順）。壊れていれば空 */
export function loadUsedHashtags(): string[] {
  return readUsed().map((u) => u.tag);
}

/** 本文のハッシュタグを使用時刻 ts で記録し直す（新しい順・USED_HASHTAGS_MAX 件まで） */
export function recordHashtags(content: string, ts: number): void {
  const tags = hashtagsIn(content);
  if (tags.length === 0) return;
  const fresh = new Set(tags);
  const next = [...tags.map((tag) => ({ tag, lastUsed: ts })), ...readUsed().filter((u) => !fresh.has(u.tag))]
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .slice(0, USED_HASHTAGS_MAX);
  try {
    localStorage.setItem(USED_HASHTAGS_KEY, JSON.stringify(next));
  } catch {
    // 記録できなくても投稿には影響しない
  }
}

/** 「最近のタグ」チップの件数（ネイティブ RECENT_HASHTAG_CHIPS） */
export const RECENT_HASHTAG_CHIPS = 8;

/** 「最近のタグ」: 使用履歴の新しい順からピン留めを除いて 8 件 */
export function recentHashtagChips(used: readonly string[], pinned: readonly string[]): string[] {
  return used.filter((t) => !pinned.includes(t)).slice(0, RECENT_HASHTAG_CHIPS);
}

/** 入力中の #断片 の候補: ピン留め + 使用履歴から前方一致（断片そのものは除く）8 件 */
export function tagSuggestions(prefix: string, pinned: readonly string[], used: readonly string[]): string[] {
  return [...new Set([...pinned, ...used])].filter((t) => t.startsWith(prefix) && t !== prefix).slice(0, 8);
}

// ---- ピン留めハッシュタグ（kind:30015 / d=pinned。読むだけ。編集は M2） ----

/** ピン留めの上限（ネイティブ PinnedHashtags.MAX） */
export const PINNED_MAX = 15;

/** kind:30015（d=pinned）の t タグを正規化して並び順のまま（ネイティブ PinnedHashtags.parse） */
export function pinnedHashtagsFrom(event?: NostrEvent): string[] {
  if (event?.kind !== 30015) return [];
  if (event.tags.find((t) => t[0] === "d")?.[1] !== "pinned") return [];
  const out = new Set<string>();
  for (const tag of event.tags) {
    if (tag.length < 2 || tag[0] !== "t") continue;
    const trimmed = tag[1].trim();
    const value = (trimmed.startsWith("#") ? trimmed.slice(1) : trimmed).trim().toLowerCase();
    if (!/^[\p{L}\p{Nd}_]+$/u.test(value)) continue;
    out.add(value);
    if (out.size >= PINNED_MAX) break;
  }
  return [...out];
}

/** 自分のピン留めハッシュタグ */
export function usePinnedHashtags(me: string | null): string[] {
  const event = use$(
    () => (me ? eventStore.replaceable({ kind: 30015, pubkey: me, identifier: "pinned" }) : undefined),
    [me],
  );
  return useMemo(() => pinnedHashtagsFrom(event), [event]);
}

// ---- 未送信 → 下書き ----

/**
 * 「下書きに戻す」（ネイティブ unsentToDraft）: 未送信の本文を下書きへ移し、手元の投稿と未送信を消す。
 * 既に下書きがあれば後ろに足す。無ければ false。
 */
export function unsentToDraft(localId: string): boolean {
  const event = discardUnsent(localId);
  if (!event) return false;
  const existing = loadDraft();
  saveDraft(existing.trim() === "" ? event.content : `${existing}\n\n${event.content}`);
  return true;
}
