import Dexie, { type Table } from "dexie";
import type { NostrEvent } from "nostr-tools/pure";

export const DB_NAME = "nostrism";
export const DB_VERSION = 1;

/**
 * 保存するイベント（NIP-01 の 7 列）。t/e/p/q/E/A/d はタグ値の配列列で、ネイティブの `event_tag` の代わりに
 * マルチエントリ索引で引く。索引するタグ名は kind 別（events.ts の indexableTagKeys）。値が無いタグ名の列は作らない。
 */
export type EventRow = Pick<
  NostrEvent,
  "id" | "pubkey" | "kind" | "created_at" | "content" | "tags" | "sig"
> & {
  t?: string[];
  e?: string[];
  p?: string[];
  q?: string[];
  E?: string[];
  A?: string[];
  d?: string[];
};

/** 未送信の保持（Nostr.sq の publish_queue と同じ意味）。書き込みは #458 */
export type PublishQueueRow = {
  eventId: string;
  /** 署名済みイベント */
  payload: NostrEvent;
  createdAt: number;
  attempts: number;
  /** 配信先を限定するとき（DM の gift wrap）。null = 通常の配信先 */
  relays: string[] | null;
  /** 画面上の行の id（DM は rumor id）。null = eventId そのもの */
  refId: string | null;
};

/** 鍵の保管。列は #462 が決める（id は "local" 固定の想定） */
export type VaultRow = { id: string } & Record<string, unknown>;

/** OGP のキャッシュ。書き込みは #466 */
export type OgpCacheRow = {
  url: string;
  fetchedAt: number;
  ok: boolean;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

/**
 * IndexedDB（Dexie）。件数が増えるもの（イベント・未送信・OGP・鍵）だけを置く。
 * 起動時に同期で読みたい小さな設定（セッション・リレー一覧・カラム構成）は localStorage（`nostrism.` 接頭辞）。
 */
export class NostrismDb extends Dexie {
  events!: Table<EventRow, string>;
  publishQueue!: Table<PublishQueueRow, string>;
  vault!: Table<VaultRow, string>;
  ogpCache!: Table<OgpCacheRow, string>;

  constructor(name: string, options: { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange }) {
    super(name, options);
    this.version(DB_VERSION).stores({
      events: "id, pubkey, kind, created_at, [kind+pubkey], [kind+created_at], *t, *e, *p, *q, *E, *A, *d",
      publishQueue: "eventId, createdAt, attempts, refId",
      vault: "id",
      ogpCache: "url, fetchedAt",
    });
  }
}

/** DB を作る（開かない）。テストでは fake-indexeddb の IDBFactory / IDBKeyRange を渡す */
export function createDatabase(
  opts: { name?: string; indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange } = {},
): NostrismDb {
  // Dexie は undefined を渡すと既定（グローバルの indexedDB）を上書きしてしまうので、指定されたものだけ渡す
  const deps: { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange } = {};
  if (opts.indexedDB) deps.indexedDB = opts.indexedDB;
  if (opts.IDBKeyRange) deps.IDBKeyRange = opts.IDBKeyRange;
  return new NostrismDb(opts.name ?? DB_NAME, deps);
}
