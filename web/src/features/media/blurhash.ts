import { decode, isBlurhashValid } from "blurhash";

/**
 * imeta の blurhash を小さな RGBA 配列に展開する（ネイティブの BlurhashPainter.kt / nostr-core の Blurhash.kt）。
 * 20×20 に展開して描画時に拡大する（元々ぼかしなので粗さは見えない）。
 */

/** base83 の文字（npm の isBlurhashValid は長さしか見ないので、ネイティブと同じく不正文字もここで弾く） */
const BASE83 = /^[0-9A-Za-z#$%*+,\-.:;=?@[\]^_{|}~]+$/;

const CACHE_LIMIT = 200;
const cache = new Map<string, Uint8ClampedArray | null>();

/** size×size の RGBA ピクセル。壊れた hash は null（表示側は単色の背景のまま）。結果は最大 200 件まで覚える */
export function decodeBlurhash(hash: string, size = 20): Uint8ClampedArray | null {
  const key = `${size}:${hash}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const pixels = decodeUncached(hash, size);
  cache.set(key, pixels);
  if (cache.size > CACHE_LIMIT) {
    // Map は挿入順なので先頭が最古
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return pixels;
}

function decodeUncached(hash: string, size: number): Uint8ClampedArray | null {
  if (!BASE83.test(hash) || !isBlurhashValid(hash).result) return null;
  try {
    return decode(hash, size, size, 1);
  } catch {
    return null;
  }
}
