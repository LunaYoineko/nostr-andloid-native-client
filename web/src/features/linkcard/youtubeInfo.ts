import { useEffect, useState } from "react";

/** YouTube 動画のタイトルとチャンネル名（ネイティブ EventRepository.fetchYouTubeInfo の Pair） */
export type YouTubeInfo = { title: string; author: string };
/** null = 取れなかった */
export type YouTubeInfoResult = YouTubeInfo | null;

/** メモリに覚える件数（ネイティブの ytInfoCache と同じ 256。失敗も覚える） */
export const YOUTUBE_INFO_MEMORY_MAX = 256;

export type YouTubeInfoLoader = {
  peek(id: string): YouTubeInfoResult | undefined;
  /** /api/oembed?v= から取る。同じ動画の同時の取得は 1 本にまとめる。reject しない */
  load(id: string): Promise<YouTubeInfoResult>;
};

async function fetchInfo(id: string, fetchImpl: typeof fetch): Promise<YouTubeInfoResult> {
  const res = await fetchImpl(`/api/oembed?v=${encodeURIComponent(id)}`, { credentials: "same-origin" });
  if (!res.ok) return null;
  const json: unknown = await res.json();
  if (typeof json !== "object" || json === null) return null;
  const { title, author_name } = json as { title?: unknown; author_name?: unknown };
  if (typeof title !== "string" || title.trim() === "") return null;
  return { title, author: typeof author_name === "string" ? author_name : "" };
}

export function createYouTubeInfoLoader(fetchImpl: typeof fetch): YouTubeInfoLoader {
  const memory = new Map<string, YouTubeInfoResult>();
  const inflight = new Map<string, Promise<YouTubeInfoResult>>();

  function load(id: string): Promise<YouTubeInfoResult> {
    if (memory.has(id)) return Promise.resolve(memory.get(id) as YouTubeInfoResult);
    const running = inflight.get(id);
    if (running) return running;
    const promise = fetchInfo(id, fetchImpl)
      .catch(() => null)
      .then((result) => {
        memory.set(id, result);
        if (memory.size > YOUTUBE_INFO_MEMORY_MAX) {
          const oldest = memory.keys().next().value;
          if (oldest !== undefined) memory.delete(oldest);
        }
        inflight.delete(id);
        return result;
      });
    inflight.set(id, promise);
    return promise;
  }

  return { peek: (id) => memory.get(id), load };
}

/** アプリ全体で共有する取得口 */
export const youtubeInfoLoader = createYouTubeInfoLoader((input, init) => fetch(input, init));

/** 動画のタイトルとチャンネル名。取得中・取れなければ null */
export function useYouTubeInfo(id: string): YouTubeInfo | null {
  const [state, setState] = useState(() => ({ id, info: youtubeInfoLoader.peek(id) ?? null }));

  useEffect(() => {
    let alive = true;
    void youtubeInfoLoader.load(id).then((info) => {
      if (alive) setState((prev) => (prev.id === id && prev.info === info ? prev : { id, info }));
    });
    return () => {
      alive = false;
    };
  }, [id]);

  return state.id === id ? state.info : (youtubeInfoLoader.peek(id) ?? null);
}
