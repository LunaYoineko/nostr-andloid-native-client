/**
 * 画像の無いアバターの頭文字と地の色（ネイティブの Avatar.kt の Initial / monoShade）。
 */

/**
 * seed の先頭 1 文字を大文字にしたもの（空なら「?」）。
 * ネイティブは UTF-16 の 1 単位を取るが、絵文字などを割らないよう 1 コードポイントにする。
 * 大文字が 1 文字に収まらないもの（ß → SS など）はそのまま（Kotlin の uppercaseChar と同じ）。
 */
export function avatarInitial(seed: string): string {
  const code = seed.trim().codePointAt(0);
  if (code === undefined) return "?";
  const ch = String.fromCodePoint(code);
  const upper = ch.toUpperCase();
  return upper.length === ch.length ? upper : ch;
}

/** seed → 無彩色のグレー（明度 56〜111）。32 ビット整数の桁あふれも Kotlin の Int と同じに計算する */
export function avatarShade(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  // Kotlin の abs(Int.MIN_VALUE) は負のまま（JS の Math.abs は正になる）
  const v = 56 + ((h === -2147483648 ? h : Math.abs(h)) % 56);
  return `rgb(${v}, ${v}, ${v})`;
}
