/**
 * 同時に再生する動画は 1 本だけ（ネイティブの VideoPlayer.android.kt）。
 * 新しく再生が始まった要素を覚え、その前に再生していた要素を一時停止する。
 */
let current: HTMLMediaElement | null = null;

/** el の再生が始まった。直前に再生していた別の要素があれば止める */
export function claimPlayback(el: HTMLMediaElement) {
  if (current && current !== el) current.pause();
  current = el;
}

/** el を片付ける（アンマウント時）。覚えている要素が el なら忘れる */
export function releasePlayback(el: HTMLMediaElement) {
  if (current === el) current = null;
}
