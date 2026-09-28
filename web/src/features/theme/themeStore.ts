import { use$ } from "applesauce-react/hooks/use-$";
import type { EventTemplate, NostrEvent } from "nostr-tools/pure";
import { useEffect, useMemo, useState } from "react";
import { INDEXER_RELAYS } from "../../lib/columnRequest";
import { unixNow } from "../../lib/time";
import { refetchOwnReplaceable } from "../../nostr/ownReplaceable";
import { requestOnce, useReadRelays } from "../../nostr/pool";
import { PublishError, type PublishFailure, publishEvent } from "../../nostr/publish";
import { eventStore } from "../../nostr/store";
import { requestDelete } from "../actions/reactions";
import type { CustomColors } from "./customPalette";
import {
  DEFAULT_MIN_APP_VERSION,
  parseThemeEntry,
  THEME_APP,
  THEME_DISCOVERY_TAG,
  THEME_SCHEMA,
  type ThemeEntry,
  themeDTag,
} from "./themeEntry";

/** 30078 を取りに行って待つ時間（ネイティブ requestThemes と同じ 10 秒） */
export const THEME_FETCH_MS = 10_000;
/** 一覧の表示上限（ネイティブ themeEntriesFlow / requestThemes と同じ） */
export const THEME_LIST_CAP = 200;

const NO_EVENTS: NostrEvent[] = [];

/** 同一 (author, dTag) は createdAt が新しい方だけを残す（addressable の重複除去） */
export function dedupeThemeEntries(entries: readonly ThemeEntry[]): ThemeEntry[] {
  const latest = new Map<string, ThemeEntry>();
  for (const e of entries) {
    const key = `${e.author}:${e.dTag}`;
    const current = latest.get(key);
    if (!current || current.createdAt < e.createdAt) latest.set(key, e);
  }
  return [...latest.values()];
}

/** イベント群 → 解析できたものだけ ThemeEntry へ → 重複除去 */
export function parseThemeEntries(events: readonly NostrEvent[]): ThemeEntry[] {
  const parsed: ThemeEntry[] = [];
  for (const event of events) {
    const entry = parseThemeEntry(event);
    if (entry) parsed.push(entry);
  }
  return dedupeThemeEntries(parsed);
}

/**
 * テーマストアの一覧（kind:30078 + t=nostrism-theme）。開いている間に自分のリレー + インデクサへ
 * 1度だけ取りに行き（ネイティブ requestThemes と同じ 10 秒。EOSE/タイムアウトで読み込み中を消す）、
 * EventStore 経由で解析結果（重複除去済み）を返す。
 */
export function useThemeStoreEntries(): { loading: boolean; entries: ThemeEntry[] } {
  const relays = useReadRelays();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const done = () => setLoading(false);
    const sub = requestOnce(
      [...new Set([...relays, ...INDEXER_RELAYS])],
      [{ kinds: [30078], "#t": [THEME_DISCOVERY_TAG], limit: THEME_LIST_CAP }],
      THEME_FETCH_MS,
    ).subscribe({ complete: done, error: done });
    return () => sub.unsubscribe();
  }, [relays]);

  const events =
    use$(() => eventStore.timeline({ kinds: [30078], "#t": [THEME_DISCOVERY_TAG] }), []) ?? NO_EVENTS;
  const entries = useMemo(() => parseThemeEntries(events), [events]);
  return { loading, entries };
}

export type ThemeStoreScope = "all" | "following" | "mine";
export type ThemeStoreSort = "newest" | "name";

/** 検索（テーマ名・作者名）・範囲（すべて/フォロー中/自分）で絞り込む（ネイティブ ThemeStorePage の shown と同じ） */
export function filterThemeEntries(
  entries: readonly ThemeEntry[],
  opts: {
    query: string;
    scope: ThemeStoreScope;
    me: string | null;
    follows: ReadonlySet<string>;
    authorName?: (pubkey: string) => string | undefined;
  },
): ThemeEntry[] {
  const q = opts.query.trim().toLowerCase();
  return entries.filter((e) => {
    if (opts.scope === "following" && !opts.follows.has(e.author)) return false;
    if (opts.scope === "mine" && e.author !== opts.me) return false;
    if (q === "") return true;
    if (e.name.toLowerCase().includes(q)) return true;
    const authorName = opts.authorName?.(e.author);
    return authorName ? authorName.toLowerCase().includes(q) : false;
  });
}

/** 並び替え（新着 = createdAt 降順 / 名前 = 名前順）。引数は書き換えない */
export function sortThemeEntries(entries: readonly ThemeEntry[], sort: ThemeStoreSort): ThemeEntry[] {
  const copy = [...entries];
  if (sort === "name") copy.sort((a, b) => a.name.localeCompare(b.name));
  else copy.sort((a, b) => b.createdAt - a.createdAt);
  return copy;
}

// ---- 公開（#478 の規則） ----

export type ThemePublishFailure = "no-theme" | "stale" | PublishFailure;

export class ThemePublishError extends Error {
  readonly reason: ThemePublishFailure;

  constructor(reason: ThemePublishFailure, options?: ErrorOptions) {
    super(`theme publish failed: ${reason}`, options);
    this.name = "ThemePublishError";
    this.reason = reason;
  }
}

/** JSON 文字列または値がオブジェクトならそれを返す（それ以外・壊れた JSON は null） */
function parseObject(value: unknown): Record<string, unknown> | null {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

/**
 * 発行する kind:30078。取り直した版（base。同じ d が無ければ null）の d/t/title 以外のタグは
 * そのまま残す（未知タグの保持）。content も base の JSON にある Web が知らない項目（colors の中の他の色を含む）を
 * 残し、app / schema / name / colors の 3 色だけを差し替える（#478）。minAppVersion は base にあればそれを保つ。
 */
export function buildThemePublishTemplate(
  base: NostrEvent | null,
  name: string,
  colors: CustomColors,
  nowSec: number,
): EventTemplate {
  const dTag = themeDTag(name);
  const knownTags = new Set(["d", "t", "title"]);
  const others = (base?.tags ?? []).filter((t) => !knownTags.has(t[0]));
  const baseContent = parseObject(base?.content);
  const baseColors = parseObject(baseContent?.colors);
  const content = JSON.stringify({
    ...baseContent,
    app: THEME_APP,
    schema: THEME_SCHEMA,
    name,
    minAppVersion:
      typeof baseContent?.minAppVersion === "string" ? baseContent.minAppVersion : DEFAULT_MIN_APP_VERSION,
    colors: { ...baseColors, ...colors },
  });
  return {
    kind: 30078,
    content,
    tags: [["d", dTag], ["t", THEME_DISCOVERY_TAG], ["title", name], ...others],
    // 同じ秒に続けて公開しても、置換可能イベントの新旧が崩れないように
    created_at: Math.max(nowSec, (base?.created_at ?? 0) + 1),
  };
}

/**
 * テーマストアへ公開する（#478 の規則）。発行の直前に自分の同じ d（name から決まる）の kind:30078 を
 * read ∪ write ∪ インデクサから取り直し（refetchOwnReplaceable）、どのリレーからも応答が無ければ
 * 発行しない（no-theme）。手元にあった同じ d の版（無ければ null）と取り直した版の id が違えば
 * 発行しない（stale。別の端末で同じ名前を公開・更新している）。同じ d の版があれば、その未知タグを
 * 保ったまま上書き更新する。
 */
export async function publishTheme(me: string, name: string, colors: CustomColors): Promise<NostrEvent> {
  const dTag = themeDTag(name);
  const before = eventStore.getReplaceable(30078, me, dTag)?.id ?? null;
  let fresh: NostrEvent | null;
  try {
    fresh = await refetchOwnReplaceable(me, 30078, dTag);
  } catch (e) {
    throw new ThemePublishError("no-theme", { cause: e });
  }
  if ((fresh?.id ?? null) !== before) throw new ThemePublishError("stale");
  const template = buildThemePublishTemplate(fresh, name, colors, unixNow());
  try {
    return await publishEvent(template);
  } catch (e) {
    if (e instanceof PublishError) throw new ThemePublishError(e.reason, { cause: e });
    throw e;
  }
}

// ---- 削除 ----

/**
 * 自分が公開したテーマの削除をリクエストする（NIP-09）。既存の削除リクエスト（reactions.ts の
 * requestDelete）をそのまま使うので、addressable な kind:30078 には e / k / a が付く。
 * EventStore に見つからなければ何もせず false。
 */
export async function requestDeleteTheme(entry: ThemeEntry): Promise<boolean> {
  const event = eventStore.getReplaceable(30078, entry.author, entry.dTag);
  if (!event) return false;
  return requestDelete(event);
}
