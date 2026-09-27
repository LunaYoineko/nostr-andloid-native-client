import { useEffect, useRef } from "react";
import { decodeBlurhash } from "./blurhash";

const SIZE = 20;

/**
 * blurhash のぼかし（ネイティブの BlurhashPainter.kt）。20×20 の canvas を CSS で拡大して描く（ぼけるのは意図どおり）。
 * 大きさ・配置は呼び出し側の className で決める。壊れた hash なら何も描かない。
 * 2D コンテキストが取れない環境（jsdom 等）では空の canvas のまま。
 */
export function BlurhashCanvas({ hash, className }: { hash: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pixels = decodeBlurhash(hash, SIZE);

  useEffect(() => {
    const context = pixels ? ref.current?.getContext("2d") : null;
    if (!pixels || !context) return;
    // ImageData は ArrayBuffer 裏付けの配列を要求する（decode は常に新しい ArrayBuffer で作る）
    context.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, SIZE, SIZE), 0, 0);
  }, [pixels]);

  if (!pixels) return null;
  // aria-hidden="true" として出る（文字列で書くと biome が canvas をフォーカス可能と誤判定する）
  return <canvas ref={ref} className={className} width={SIZE} height={SIZE} aria-hidden />;
}
