import { describe, expect, it } from "vitest";
import {
  editTransform,
  flippedHorizontally,
  type ImageEdit,
  isEdited,
  NO_EDIT,
  orientedSize,
  type Rotation,
  rotatedLeft,
  rotatedRight,
} from "./imageEdit";

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const ALL: ImageEdit[] = ROTATIONS.flatMap((rotation) => [
  { rotation, flip: false },
  { rotation, flip: true },
]);

/** 変換行列を点に当てる（canvas の setTransform と同じ: x' = a x + c y + e, y' = b x + d y + f） */
function apply(m: readonly number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** 元画像の四隅（左上・右上・右下・左下）が、編集後のどこへ行くか */
function corners(dw: number, dh: number, edit: ImageEdit): [number, number][] {
  const { matrix } = editTransform(dw, dh, edit);
  return [
    [-dw / 2, -dh / 2],
    [dw / 2, -dh / 2],
    [dw / 2, dh / 2],
    [-dw / 2, dh / 2],
  ].map(([x, y]) => apply(matrix, x, y));
}

describe("orientedSize", () => {
  it("90° / 270° は縦横が入れ替わる", () => {
    expect(orientedSize(400, 300, { rotation: 90, flip: false })).toEqual({ w: 300, h: 400 });
    expect(orientedSize(400, 300, { rotation: 270, flip: true })).toEqual({ w: 300, h: 400 });
  });

  it("0° / 180° は寸法が変わらない（反転しても同じ）", () => {
    for (const flip of [false, true]) {
      expect(orientedSize(400, 300, { rotation: 0, flip })).toEqual({ w: 400, h: 300 });
      expect(orientedSize(400, 300, { rotation: 180, flip })).toEqual({ w: 400, h: 300 });
    }
  });
});

describe("rotatedRight / rotatedLeft / flippedHorizontally", () => {
  it("右に 4 回・左に 4 回で元に戻る。右と左は打ち消し合う", () => {
    for (const edit of ALL) {
      let r = edit;
      for (let i = 0; i < 4; i++) r = rotatedRight(r);
      expect(r).toEqual(edit);
      expect(rotatedLeft(rotatedRight(edit))).toEqual(edit);
    }
  });

  it("左右反転は 2 回で元に戻る（冪等ではなく対合）", () => {
    for (const edit of ALL) expect(flippedHorizontally(flippedHorizontally(edit))).toEqual(edit);
  });

  it("操作は今見えている向きに効く: 反転した後の右回転も、見た目の右回り", () => {
    // 「反転 → 回転」の順で持つので、反転済みでも rotation に +90 すれば見た目は右回り
    const flipped = flippedHorizontally(NO_EDIT);
    const after = rotatedRight(flipped);
    // 元画像の左上は、反転で右上へ → 右に回して右下へ
    const [topLeft] = corners(400, 300, after);
    const [w, h] = [300, 400];
    expect(topLeft).toEqual([w, h]);
  });

  it("見た目で反転 → 右回転 と 右回転 → 見た目で反転 は、回転の向きが逆になる", () => {
    const a = rotatedRight(NO_EDIT);
    expect(flippedHorizontally(a)).toEqual({ rotation: 270, flip: true });
  });

  it("isEdited は回転か反転があるときだけ true", () => {
    expect(isEdited(NO_EDIT)).toBe(false);
    expect(isEdited({ rotation: 90, flip: false })).toBe(true);
    expect(isEdited({ rotation: 0, flip: true })).toBe(true);
  });
});

describe("editTransform", () => {
  it("編集なしは恒等（canvas の中心へ置くだけ）", () => {
    expect(editTransform(400, 300, NO_EDIT)).toEqual({
      width: 400,
      height: 300,
      matrix: [1, 0, 0, 1, 200, 150],
    });
  });

  it("canvas の大きさは orientedSize と同じ。四隅は canvas に収まる", () => {
    for (const edit of ALL) {
      const t = editTransform(400, 300, edit);
      expect({ w: t.width, h: t.height }).toEqual(orientedSize(400, 300, edit));
      for (const [x, y] of corners(400, 300, edit)) {
        expect(x === 0 || x === t.width).toBe(true);
        expect(y === 0 || y === t.height).toBe(true);
      }
    }
  });

  it("右に 90°: 左上の隅は右上へ行く", () => {
    const c = corners(400, 300, { rotation: 90, flip: false });
    expect(c[0]).toEqual([300, 0]);
    expect(c[1]).toEqual([300, 400]);
  });

  it("180°: 寸法不変で、隅は点対称に入れ替わる", () => {
    const c = corners(400, 300, { rotation: 180, flip: false });
    expect(c[0]).toEqual([400, 300]);
    expect(c[2]).toEqual([0, 0]);
  });

  it("左右反転: 左上の隅は右上へ行く。2 回の反転（行列の合成）は恒等", () => {
    const c = corners(400, 300, { rotation: 0, flip: true });
    expect(c[0]).toEqual([400, 0]);
    expect(c[3]).toEqual([400, 300]);
    // 見た目の左右反転を 2 回かけた編集は、隅が元に戻る
    const twice = flippedHorizontally(flippedHorizontally(NO_EDIT));
    expect(corners(400, 300, twice)).toEqual(corners(400, 300, NO_EDIT));
  });

  it("反転してから回す: 反転 + 右 90° の左上は右下へ行く", () => {
    const c = corners(400, 300, { rotation: 90, flip: true });
    expect(c[0]).toEqual([300, 400]);
  });
});
