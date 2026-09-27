import Dexie from "dexie";
import { type NostrEvent, verifiedSymbol } from "nostr-tools/pure";
import type { EventRow, NostrismDb } from "./schema";

/**
 * 保存する kind（置換可能イベントと DM）。過去のタイムライン（kind:1 等）は保存しない
 * （ネイティブの clearTimelineEvents と同じ方針。未送信は kind に関係なく残す）。
 */
export const PERSIST_KINDS: ReadonlySet<number> = new Set([
  0, 3, 14, 10000, 10002, 10030, 10050, 30078, 30000, 30015, 30030,
]);

/** events がこの件数を超えたら古いプロフィール等を消す（推測値。本番の件数を見て見直す） */
export const EVENTS_CAP = 20_000;
/** 上限超えで消すときの目標件数 */
export const EVENTS_TRIM_TO = 15_000;
/** OGP キャッシュを消すまでの秒数（14 日） */
export const OGP_PURGE_SEC = 14 * 24 * 3600;

/** DB から戻したイベントの印。書き戻しの対象から外すために使う */
export const hydratedSymbol = Symbol("nostrism.hydrated");

/** ネイティブの TAG_KEYS（t,e,p,q,E,A）+ d */
const TAG_KEYS: ReadonlySet<string> = new Set(["t", "e", "p", "q", "E", "A", "d"]);
/** NIP-51 セット（30000/30003）の p はメンバー列挙で数百件になり得て、逆引きも使わないので索引しない */
const TAG_KEYS_NO_P: ReadonlySet<string> = new Set(["t", "e", "q", "E", "A", "d"]);
/** ピン留め（30015）の t は一覧そのもので、逆引きは使わないので索引しない */
const TAG_KEYS_NO_T: ReadonlySet<string> = new Set(["e", "p", "q", "E", "A", "d"]);

/** kind 別に索引するタグ名（ネイティブ EventRepository.indexableTagKeys と同じ + d） */
export function indexableTagKeys(kind: number): ReadonlySet<string> {
  switch (kind) {
    case 30000:
    case 30003:
      return TAG_KEYS_NO_P;
    case 30015:
      return TAG_KEYS_NO_T;
    default:
      return TAG_KEYS;
  }
}

type TagColumn = "t" | "e" | "p" | "q" | "E" | "A" | "d";

/**
 * イベントを行にする。7 列だけを写し、索引するタグ名ごとに第 2 要素を重複なしで配列列へ入れる。
 * t はネイティブの indexTags と同じく小文字で索引する（tags 本体は変えない）。
 */
export function toRow(event: NostrEvent): EventRow {
  const { id, pubkey, kind, created_at, content, tags, sig } = event;
  const row: EventRow = { id, pubkey, kind, created_at, content, tags, sig };
  const keys = indexableTagKeys(kind);
  const values = new Map<TagColumn, Set<string>>();
  for (const [name, value] of tags) {
    if (typeof value !== "string" || !keys.has(name)) continue;
    const column = name as TagColumn;
    let set = values.get(column);
    if (!set) {
      set = new Set();
      values.set(column, set);
    }
    set.add(column === "t" ? value.toLowerCase() : value);
  }
  for (const [column, set] of values) row[column] = [...set];
  return row;
}

/**
 * 行をイベントに戻す。7 列だけの新しいオブジェクトに、検証済み（EventStore が再検証しない）と
 * DB から戻した印（書き戻さない）を付ける。
 */
export function fromRow(row: EventRow): NostrEvent {
  const event: NostrEvent = {
    id: row.id,
    pubkey: row.pubkey,
    kind: row.kind,
    created_at: row.created_at,
    content: row.content,
    tags: row.tags,
    sig: row.sig,
  };
  const marks = event as unknown as Record<symbol, unknown>;
  marks[verifiedSymbol] = true;
  marks[hydratedSymbol] = true;
  return event;
}

/**
 * 起動時の掃除。保存対象外の kind（未送信は除く）を消し、上限を超えていれば古いプロフィール等を消し、
 * 古い OGP キャッシュを消す。
 */
export async function evictOnOpen(
  db: NostrismDb,
  opts: { now: number; me: string | null; cap?: number; trimTo?: number },
): Promise<void> {
  const pending = new Set(await db.publishQueue.toCollection().primaryKeys());
  const stale = await db.events
    .where("kind")
    .noneOf([...PERSIST_KINDS])
    .primaryKeys();
  await db.events.bulkDelete(stale.filter((id) => !pending.has(id)));
  await trimEvents(db, opts);
  await db.ogpCache
    .where("fetchedAt")
    .below(opts.now - OGP_PURGE_SEC)
    .delete();
}

/**
 * events が cap を超えていたら、kind:0 → kind:10002 の順に古いものから消して trimTo 以下にする。
 * 消すのは他人の kind:0 / 10002 だけで、自分（me）の行（kind:3・10000・10030・10050・30078 等も含む）と
 * 未送信は消さない。起動時のほか、書き込みが容量超過で失敗したときにも呼ぶ。
 */
export async function trimEvents(
  db: NostrismDb,
  opts: { me: string | null; cap?: number; trimTo?: number },
): Promise<void> {
  const cap = opts.cap ?? EVENTS_CAP;
  const trimTo = opts.trimTo ?? EVENTS_TRIM_TO;
  let count = await db.events.count();
  if (count <= cap) return;
  const pending = new Set(await db.publishQueue.toCollection().primaryKeys());
  for (const kind of [0, 10002]) {
    if (count <= trimTo) break;
    const ids = await db.events
      .where("[kind+created_at]")
      .between([kind, Dexie.minKey], [kind, Dexie.maxKey])
      .filter((row) => row.pubkey !== opts.me && !pending.has(row.id))
      .limit(count - trimTo)
      .primaryKeys();
    await db.events.bulkDelete(ids);
    count -= ids.length;
  }
}
