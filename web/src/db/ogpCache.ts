import type { NostrismDb, OgpCacheRow } from "./schema";

/** 成功の保持秒数（ネイティブ EventRepository.OGP_TTL_OK_SEC = 7 日） */
export const OGP_TTL_OK_SEC = 7 * 24 * 3600;
/** 失敗の保持秒数（OGP_TTL_NG_SEC = 1 日。取れない URL の再試行をこの間隔に抑える） */
export const OGP_TTL_NG_SEC = 24 * 3600;

/**
 * TTL 内の OGP キャッシュ（成功 7 日・失敗 1 日）。無い・切れていれば undefined。
 * @param now unix 秒（fetchedAt と同じ単位）
 */
export async function getFreshOgp(
  db: NostrismDb,
  url: string,
  now: number,
): Promise<OgpCacheRow | undefined> {
  const row = await db.ogpCache.get(url);
  if (!row) return undefined;
  const ttl = row.ok ? OGP_TTL_OK_SEC : OGP_TTL_NG_SEC;
  return now - row.fetchedAt < ttl ? row : undefined;
}

/** OGP の取得結果を書く（失敗も ok: false で書く）。同じ URL は上書き */
export async function putOgp(db: NostrismDb, row: OgpCacheRow): Promise<void> {
  await db.ogpCache.put(row);
}
