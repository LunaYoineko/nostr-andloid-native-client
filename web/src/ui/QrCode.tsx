import { useMemo } from "react";
import { encode } from "uqr";

/**
 * QR コードを SVG で描く（1 マス = viewBox の 1 単位）。色はテーマに関係なく白地に黒（読み取れるように）。
 * 文字列の SVG（renderSVG）は使わず React の要素で描く
 */
export function QrCode({ value, size = 240, label }: { value: string; size?: number; label: string }) {
  const { n, d } = useMemo(() => {
    const { data, size: n } = encode(value, { ecc: "M", border: 2 });
    let d = "";
    for (const [y, row] of data.entries()) {
      for (const [x, dark] of row.entries()) {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { n, d };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
    >
      <rect width="100%" height="100%" fill="#fff" />
      <path fill="#000" d={d} />
    </svg>
  );
}
