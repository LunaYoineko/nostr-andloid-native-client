import Dexie, { type Table } from "dexie";
import type { NostrEvent } from "nostr-tools/pure";

export const DB_NAME = "nostrism";
export const DB_VERSION = 2;

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
  /** 積んだアカウント（DM の gift wrap は使い捨て鍵で署名するので payload.pubkey と違う）。無い行は payload.pubkey */
  owner?: string;
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
 * 復号した DM（版 2）。id = rumor id（NIP-17）/ kind:4 の event id（NIP-04）。owner = ログイン中の自分。
 * kind:14（rumor）は署名が無く EventStore に入れられないので、events とは別に持つ。ログアウトで全部消す
 */
export type DmMessageRow = {
  owner: string;
  id: string;
  peer: string;
  sender: string;
  content: string;
  tags: string[][];
  createdAt: number;
  proto: "nip17" | "nip04";
};

/**
 * 復号を試した受信イベント（版 2）。eventId = gift wrap の id / kind:4 の id。
 * ok: false = 中身が壊れていて二度と読めない。署名者の拒否・タイムアウトは記録しない（次の起動でやり直す）
 */
export type DmProcessedRow = { owner: string; eventId: string; ok: boolean };

/**
 * IndexedDB（Dexie）。件数が増えるもの（イベント・未送信・OGP・鍵・DM）だけを置く。
 * 起動時に同期で読みたい小さな設定（セッション・リレー一覧・カラム構成）は localStorage（`nostrism.` 接頭辞）。
 */
export class NostrismDb extends Dexie {
  events!: Table<EventRow, string>;
  publishQueue!: Table<PublishQueueRow, string>;
  vault!: Table<VaultRow, string>;
  ogpCache!: Table<OgpCacheRow, string>;
  dmMessages!: Table<DmMessageRow, [string, string]>;
  dmProcessed!: Table<DmProcessedRow, [string, string]>;

  constructor(name: string, options: { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange }) {
    super(name, options);
    this.version(DB_VERSION).stores({
      events: "id, pubkey, kind, created_at, [kind+pubkey], [kind+created_at], *t, *e, *p, *q, *E, *A, *d",
      publishQueue: "eventId, createdAt, attempts, refId",
      vault: "id",
      ogpCache: "url, fetchedAt",
      dmMessages: "[owner+id], owner, [owner+peer]",
      dmProcessed: "[owner+eventId], owner",
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
