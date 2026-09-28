import styles from "./CatEars.module.css";

/**
 * [#540] 猫耳の三角形状（ネイティブ Avatar.kt の earPath/CatEars の移植）。
 * 呼び出し側の枠を 100x100 の単位円とみなし、半径 r=41（NYAN_CIRCLE_FRACTION/2 * 100）の円の
 * 下寄せ（中心 cy=59）を基準に、±38° 傾けた二等辺三角形を 2 つ描く。
 */
const RADIUS = 41;
const CENTER_X = 50;
const CENTER_Y = 100 - RADIUS;
const EAR_DEGREES = 38;

function earPath(halfWidth: number, base: number, tip: number): string {
  const left = CENTER_X - halfWidth * RADIUS;
  const right = CENTER_X + halfWidth * RADIUS;
  const rootY = CENTER_Y - base * RADIUS;
  const tipY = CENTER_Y - tip * RADIUS;
  return `M ${left} ${rootY} L ${right} ${rootY} L ${CENTER_X} ${tipY} Z`;
}

const OUTER_EAR = earPath(0.44, 0.84, 1.7);
const INNER_EAR = earPath(0.24, 0.9, 1.48);

/**
 * [#540] にゃんモードの猫耳。呼び出し側が `position: relative` の正方形の枠を用意し、
 * 中身（アバター本体）は 82%・下寄せで重ねること（ネイティブの NYAN_CIRCLE_FRACTION と同じ）。
 * 表示だけの演出で、クリックやフォーカスの対象にはしない。
 */
export function CatEars() {
  return (
    <svg className={styles.ears} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g transform={`rotate(${-EAR_DEGREES} ${CENTER_X} ${CENTER_Y})`}>
        <path className={styles.outer} d={OUTER_EAR} />
        <path className={styles.inner} d={INNER_EAR} />
      </g>
      <g transform={`rotate(${EAR_DEGREES} ${CENTER_X} ${CENTER_Y})`}>
        <path className={styles.outer} d={OUTER_EAR} />
        <path className={styles.inner} d={INNER_EAR} />
      </g>
    </svg>
  );
}
