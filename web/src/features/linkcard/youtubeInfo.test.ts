import { expect, it, vi } from "vitest";
import { createYouTubeInfoLoader, YOUTUBE_INFO_MEMORY_MAX } from "./youtubeInfo";

const ID = "dQw4w9WgXcQ";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

it("/api/oembed?v=<id> の title と author_name を返し、同じ動画はまとめて 1 回だけ取る", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () =>
    jsonResponse({ title: "曲名", author_name: "チャンネル" }),
  );
  const loader = createYouTubeInfoLoader(fetchImpl);

  const [a, b] = await Promise.all([loader.load(ID), loader.load(ID)]);
  expect(a).toEqual({ title: "曲名", author: "チャンネル" });
  expect(b).toBe(a);
  await loader.load(ID);
  expect(loader.peek(ID)).toBe(a);

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [input, init] = fetchImpl.mock.calls[0];
  expect(input).toBe(`/api/oembed?v=${ID}`);
  expect(init).toMatchObject({ credentials: "same-origin" });
});

it("author_name が無ければ空文字。title が無い・エラー応答・通信失敗は null で、失敗も覚える", async () => {
  expect(await createYouTubeInfoLoader(async () => jsonResponse({ title: "t" })).load(ID)).toEqual({
    title: "t",
    author: "",
  });
  expect(await createYouTubeInfoLoader(async () => jsonResponse({ author_name: "a" })).load(ID)).toBeNull();
  expect(await createYouTubeInfoLoader(async () => jsonResponse({ error: "x" }, 502)).load(ID)).toBeNull();

  const offline = vi.fn<typeof fetch>(async () => {
    throw new TypeError("Failed to fetch");
  });
  const loader = createYouTubeInfoLoader(offline);
  expect(await loader.load(ID)).toBeNull();
  expect(loader.peek(ID)).toBeNull();
  await loader.load(ID);
  expect(offline).toHaveBeenCalledTimes(1);
});

it(`メモリは ${YOUTUBE_INFO_MEMORY_MAX} 件まで（古いものから忘れる）`, async () => {
  const loader = createYouTubeInfoLoader(async () => jsonResponse({ title: "t" }));
  const ids = Array.from({ length: YOUTUBE_INFO_MEMORY_MAX + 1 }, (_, i) => String(i).padStart(11, "0"));
  for (const id of ids) await loader.load(id);
  expect(loader.peek(ids[0])).toBeUndefined();
  expect(loader.peek(ids[1])).not.toBeUndefined();
});
