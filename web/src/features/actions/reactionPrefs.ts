import { create } from "zustand";
import { unixNow } from "../../lib/time";

// ---- 既定リアクション（ネイティブ KV の default_reaction:content / default_reaction:image） ----

/** 値は {"content": string, "image": string | null} */
export const DEFAULT_REACTION_KEY = "nostrism.reaction.default";

export type DefaultReaction = { content: string; image: string | null };

/** 無い・壊れている・content が文字列でない → { content: "+", image: null } */
function readDefaultReaction(): DefaultReaction {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DEFAULT_REACTION_KEY) ?? "null");
    if (typeof value === "object" && value !== null) {
      const { content, image } = value as Record<string, unknown>;
      if (typeof content === "string") return { content, image: typeof image === "string" ? image : null };
    }
  } catch {
    // 壊れた保存値は既定へ
  }
  return { content: "+", image: null };
}

/** 既定リアクション（♡ ボタンが送る内容。カスタム絵文字なら content は :code: で image が URL） */
export const useDefaultReaction = create<DefaultReaction>()(() => readDefaultReaction());

/** 既定リアクションを変える（設定画面 #463・NIP-78 同期 #468 から） */
export function setDefaultReaction(content: string, image: string | null): void {
  useDefaultReaction.setState({ content, image });
  try {
    localStorage.setItem(DEFAULT_REACTION_KEY, JSON.stringify({ content, image }));
  } catch {
    // 保存できなくてもこのセッションでは効く
  }
}

// ---- 最近使った絵文字（ネイティブの used_emoji。ピッカーの「最近」） ----

/** 値は RecentEmoji[]（新しい順） */
export const RECENT_EMOJIS_KEY = "nostrism.reaction.recent";
/** 件数の上限（ネイティブ usedEmojisByRecency の LIMIT） */
export const RECENT_EMOJIS_MAX = 64;

/** content = 送った内容（Unicode 絵文字か :code:）。imageUrl はカスタムのみ */
export type RecentEmoji = { content: string; imageUrl: string | null; lastUsed: number; uses: number };

function isRecentEmoji(v: unknown): v is RecentEmoji {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.content === "string" &&
    (typeof r.imageUrl === "string" || r.imageUrl === null) &&
    typeof r.lastUsed === "number" &&
    typeof r.uses === "number"
  );
}

/** 最近使った絵文字（lastUsed の新しい順）。壊れていれば空 */
export function loadRecentEmojis(): RecentEmoji[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_EMOJIS_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    // sort は安定なので、同じ時刻は保存順（後から使ったものが先）のまま
    return value.filter(isRecentEmoji).sort((a, b) => b.lastUsed - a.lastUsed);
  } catch {
    return [];
  }
}

/**
 * 使った絵文字を記録する（"+" と空は記録しない）。既にあれば uses + 1・時刻と画像 URL を更新して先頭へ、
 * 無ければ uses 1 で先頭に足す。RECENT_EMOJIS_MAX 件まで。
 */
export function recordUsedEmoji(content: string, imageUrl: string | null): void {
  if (content === "+" || content === "") return;
  const list = loadRecentEmojis();
  const existing = list.find((r) => r.content === content);
  const entry: RecentEmoji = { content, imageUrl, lastUsed: unixNow(), uses: (existing?.uses ?? 0) + 1 };
  const next = [entry, ...list.filter((r) => r.content !== content)].slice(0, RECENT_EMOJIS_MAX);
  try {
    localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(next));
  } catch {
    // 記録できなくてもリアクションには影響しない
  }
}
