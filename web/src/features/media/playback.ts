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

/**
 * [#141][#540] 動画の再生位置（秒）。URL → 位置のメモリのみ（保存しない）。
 * 仮想リストから外れて戻ってきた動画を、同じ位置の一時停止状態から見せる
 * （ネイティブの ExoPlayerPool 相当）。has で「一度でも再生したか」を区別する
 * （0 秒のまま外れた場合と「まだ一度も再生していない」を取り違えないため）。
 */
const positions = new Map<string, number>();

/** url を一度でも再生したことがあるか（無ければポスター、あればアクティブなまま再開する） */
export function wasActivated(url: string): boolean {
  return positions.has(url);
}

/** url の直前の再生位置（秒）。まだ再生していなければ 0 */
export function savedPositionOf(url: string): number {
  return positions.get(url) ?? 0;
}

/** 再生位置を覚える（timeupdate・片付け時に呼ぶ） */
export function savePosition(url: string, time: number): void {
  positions.set(url, time);
}

/** テスト用: 覚えた再生位置を全部忘れる */
export function resetVideoPositions(): void {
  positions.clear();
}
