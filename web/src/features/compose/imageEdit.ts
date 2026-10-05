/**
 * 添付画像の向きの編集（回転・左右反転。ネイティブ #739 の ImageTransform と同じ約束）。
 * 「左右反転してから時計回りに rotation 度回す」の順で持つ。上下反転は持たない（180° 回転 + 左右反転で作れる）。
 * ライトボックスの操作は「今見えている向き」に効く（反転した後でも、右回転は見た目の右回り）。
 */
export type Rotation = 0 | 90 | 180 | 270;
export type ImageEdit = { rotation: Rotation; flip: boolean };

export const NO_EDIT: ImageEdit = { rotation: 0, flip: false };

export function isEdited(edit: ImageEdit): boolean {
  return edit.rotation !== 0 || edit.flip;
}

function turned(rotation: number, delta: number): Rotation {
  return ((((rotation + delta) % 360) + 360) % 360) as Rotation;
}

/** 見た目で右に 90°。反転の有無に関わらず rotation を足せばよい（反転 → 回転の順なので） */
export function rotatedRight(edit: ImageEdit): ImageEdit {
  return { ...edit, rotation: turned(edit.rotation, 90) };
}

export function rotatedLeft(edit: ImageEdit): ImageEdit {
  return { ...edit, rotation: turned(edit.rotation, -90) };
}

/** 見た目で左右反転。回転の向きが逆になる（F · R(r) = R(-r) · F） */
export function flippedHorizontally(edit: ImageEdit): ImageEdit {
  return { rotation: turned(-edit.rotation, 0), flip: !edit.flip };
}

/** 編集後の寸法（90° / 270° は縦横が入れ替わる） */
export function orientedSize(w: number, h: number, edit: ImageEdit): { w: number; h: number } {
  return edit.rotation === 90 || edit.rotation === 270 ? { w: h, h: w } : { w, h };
}

/** 90° 単位の sin / cos（浮動小数の誤差を出さない） */
const SIN_COS: Record<Rotation, [number, number]> = {
  0: [0, 1],
  90: [1, 0],
  180: [0, -1],
  270: [-1, 0],
};

/**
 * 元画像を (dw × dh) に縮めて描くときの canvas の変換。
 * canvas の大きさは orientedSize(dw, dh)。ctx.setTransform(...matrix) のあと
 * ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh) で描く（中心を canvas の中心へ置き、反転 → 回転の順に当てる）。
 */
export function editTransform(
  dw: number,
  dh: number,
  edit: ImageEdit,
): { width: number; height: number; matrix: [number, number, number, number, number, number] } {
  const { w: width, h: height } = orientedSize(dw, dh, edit);
  const [sin, cos] = SIN_COS[edit.rotation];
  const sx = edit.flip ? -1 : 1;
  // + 0 は -0 を 0 に直す
  return { width, height, matrix: [cos * sx + 0, sin * sx + 0, 0 - sin, cos, width / 2, height / 2] };
}
