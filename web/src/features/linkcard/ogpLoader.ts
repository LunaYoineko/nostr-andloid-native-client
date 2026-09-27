import { db } from "../../db";
import { getFreshOgp, putOgp } from "../../db/ogpCache";
import type { NostrismDb, OgpCacheRow } from "../../db/schema";
import { decodeHtml, type OgpData, parseOgp } from "./ogpParser";

/** OGP の取得結果。null = カードにしない（取得失敗・タイトルも画像も無い） */
export type OgpResult = OgpData | null;

/** メモリに覚える件数（ネイティブ EventRepository の ogpCache と同じ 256。超えたら最も使っていないものから消す） */
export const OGP_MEMORY_MAX = 256;

const FINAL_URL_HEADER = "X-Og-Final-Url";
const UPSTREAM_CONTENT_TYPE_HEADER = "X-Og-Upstream-Content-Type";

export type OgpLoaderDeps = {
  fetch: typeof fetch;
  /** 開いている DB（開けていなければ null = メモリだけ） */
  db: () => NostrismDb | null;
  /** unix 秒 */
  now: () => number;
};

export type OgpLoader = {
  /** メモリにある結果。まだ無ければ undefined */
  peek(url: string): OgpResult | undefined;
  /** 結果を取る（メモリ → DB（TTL 内）→ /api/og）。同じ URL の同時の取得は 1 本にまとめる。reject しない */
  load(url: string): Promise<OgpResult>;
};

function fromRow(row: OgpCacheRow): OgpResult {
  if (!row.ok) return null;
  const data: OgpData = { url: row.url };
  if (row.title) data.title = row.title;
  if (row.description) data.description = row.description;
  if (row.image) data.image = row.image;
  if (row.siteName) data.siteName = row.siteName;
  return data;
}

function toRow(url: string, result: OgpResult, fetchedAt: number): OgpCacheRow {
  const row: OgpCacheRow = { url, fetchedAt, ok: result !== null };
  if (result?.title) row.title = result.title;
  if (result?.description) row.description = result.description;
  if (result?.image) row.image = result.image;
  if (result?.siteName) row.siteName = result.siteName;
  return row;
}

/** /api/og は https だけを受けるので、それ以外は取りに行かない */
function isFetchable(url: string): boolean {
  return /^https:\/\//i.test(url);
}

export function createOgpLoader(deps: OgpLoaderDeps): OgpLoader {
  const memory = new Map<string, OgpResult>();
  const inflight = new Map<string, Promise<OgpResult>>();

  function remember(url: string, result: OgpResult) {
    memory.delete(url);
    memory.set(url, result);
    if (memory.size > OGP_MEMORY_MAX) {
      const oldest = memory.keys().next().value;
      if (oldest !== undefined) memory.delete(oldest);
    }
  }

  function peek(url: string): OgpResult | undefined {
    if (!isFetchable(url)) return null;
    if (!memory.has(url)) return undefined;
    const result = memory.get(url) as OgpResult;
    // 使ったものを新しい側へ
    remember(url, result);
    return result;
  }

  async function resolve(url: string): Promise<OgpResult> {
    const database = deps.db();
    if (database) {
      try {
        const row = await getFreshOgp(database, url, deps.now());
        if (row) return fromRow(row);
      } catch {
        // 読めなければ取りに行く
      }
    }
    let result: OgpResult;
    try {
      const res = await deps.fetch(`/api/og?url=${encodeURIComponent(url)}`, { credentials: "same-origin" });
      result = res.ok
        ? parseOgp(
            decodeHtml(await res.arrayBuffer(), res.headers.get(UPSTREAM_CONTENT_TYPE_HEADER)),
            url,
            res.headers.get(FINAL_URL_HEADER) ?? url,
          )
        : null;
    } catch {
      // 通信できなかった（オフライン等）ときは DB に残さない（メモリにだけ覚え、次に開いたときに取り直す）
      return null;
    }
    // 失敗も書く（取れない URL の再試行を TTL の 1 日に抑える）。書けなくても表示は止めない
    if (database) void putOgp(database, toRow(url, result, deps.now())).catch(() => {});
    return result;
  }

  function load(url: string): Promise<OgpResult> {
    const known = peek(url);
    if (known !== undefined) return Promise.resolve(known);
    const running = inflight.get(url);
    if (running) return running;
    const promise = resolve(url)
      .catch(() => null)
      .then((result) => {
        remember(url, result);
        inflight.delete(url);
        return result;
      });
    inflight.set(url, promise);
    return promise;
  }

  return { peek, load };
}

/** アプリ全体で共有する取得口 */
export const ogpLoader = createOgpLoader({
  fetch: (input, init) => fetch(input, init),
  db: () => db,
  now: () => Math.floor(Date.now() / 1000),
});
