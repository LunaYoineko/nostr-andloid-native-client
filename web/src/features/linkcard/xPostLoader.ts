import { db } from "../../db";
import { getFreshOgp, putOgp } from "../../db/ogpCache";
import type { NostrismDb } from "../../db/schema";
import { OGP_MEMORY_MAX } from "./ogpLoader";
import { canonicalPostUrl, dateFromOembedHtml } from "./xPost";

/** oEmbed の言語（lang）。表示言語が ja 系なら ja、それ以外は en */
export type XLang = "ja" | "en";

/** 取得結果。null = 日時を出さない（削除済み・取得失敗・日時が読めない） */
export type XDateResult = string | null;

export type XPostDateLoaderDeps = {
  fetch: typeof fetch;
  /** 開いている DB（開けていなければ null = メモリだけ） */
  db: () => NostrismDb | null;
  /** unix 秒 */
  now: () => number;
};

export type XPostDateLoader = {
  /** メモリにある結果。まだ無ければ undefined */
  peek(url: string, lang: XLang): XDateResult | undefined;
  /** 日時を取る（メモリ → DB（TTL 内）→ /api/oembed）。同じ組の同時の取得は 1 本にまとめる。reject しない */
  load(url: string, lang: XLang): Promise<XDateResult>;
};

/**
 * DB は OGP と同じ表（ogpCache）に持つ。キーは `x-oembed:<lang>:<投稿 URL>`、title に日時
 * （ネイティブ EventRepository.fetchXPostDate と同じ。TTL も OGP と同じ成功 7 日・失敗 1 日）。
 */
function cacheKey(url: string, lang: XLang): string {
  return `x-oembed:${lang}:${url}`;
}

export function createXPostDateLoader(deps: XPostDateLoaderDeps): XPostDateLoader {
  const memory = new Map<string, XDateResult>();
  const inflight = new Map<string, Promise<XDateResult>>();

  function remember(key: string, result: XDateResult) {
    memory.delete(key);
    memory.set(key, result);
    if (memory.size > OGP_MEMORY_MAX) {
      const oldest = memory.keys().next().value;
      if (oldest !== undefined) memory.delete(oldest);
    }
  }

  function peek(url: string, lang: XLang): XDateResult | undefined {
    const canonical = canonicalPostUrl(url);
    if (canonical === null) return null;
    const key = cacheKey(canonical, lang);
    if (!memory.has(key)) return undefined;
    const result = memory.get(key) as XDateResult;
    remember(key, result);
    return result;
  }

  async function resolve(canonical: string, lang: XLang, key: string): Promise<XDateResult> {
    const database = deps.db();
    if (database) {
      try {
        const row = await getFreshOgp(database, key, deps.now());
        if (row) return row.ok && row.title ? row.title : null;
      } catch {
        // 読めなければ取りに行く
      }
    }
    let date: XDateResult;
    try {
      const res = await deps.fetch(`/api/oembed?url=${encodeURIComponent(canonical)}&lang=${lang}`, {
        credentials: "same-origin",
      });
      if (res.ok) {
        const body: unknown = await res.json();
        const html =
          typeof body === "object" && body !== null ? (body as { html?: unknown }).html : undefined;
        date = typeof html === "string" ? dateFromOembedHtml(html) : null;
      } else {
        date = null;
      }
    } catch {
      // 通信できなかった（オフライン等）ときは DB に残さない（メモリにだけ覚え、次に開いたときに取り直す）
      return null;
    }
    // 失敗も書く（取れない投稿の再試行を TTL の 1 日に抑える）。書けなくても表示は止めない
    if (database) {
      const row = {
        url: key,
        fetchedAt: deps.now(),
        ok: date !== null,
        ...(date !== null ? { title: date } : {}),
      };
      void putOgp(database, row).catch(() => {});
    }
    return date;
  }

  function load(url: string, lang: XLang): Promise<XDateResult> {
    const canonical = canonicalPostUrl(url);
    if (canonical === null) return Promise.resolve(null);
    const key = cacheKey(canonical, lang);
    const known = peek(url, lang);
    if (known !== undefined) return Promise.resolve(known);
    const running = inflight.get(key);
    if (running) return running;
    const promise = resolve(canonical, lang, key)
      .catch(() => null)
      .then((result) => {
        remember(key, result);
        inflight.delete(key);
        return result;
      });
    inflight.set(key, promise);
    return promise;
  }

  return { peek, load };
}

/** アプリ全体で共有する取得口 */
export const xPostDateLoader = createXPostDateLoader({
  fetch: (input, init) => fetch(input, init),
  db: () => db,
  now: () => Math.floor(Date.now() / 1000),
});
