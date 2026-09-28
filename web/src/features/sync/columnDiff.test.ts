import { describe, expect, it } from "vitest";
import { type ColumnSpec, defaultFilter } from "../../lib/columns";
import { applyColumnDiffs, diffDeckColumns } from "./columnDiff";

/** [#468] ネイティブ SettingsSyncDiffTest.kt（カラム構成の差分・適用ぶん）の移植。 */
function col(id: string, opts: { title?: string; order?: number; hashtags?: string[] } = {}): ColumnSpec {
  const hashtags = opts.hashtags ?? [];
  return {
    id,
    title: opts.title ?? id,
    subtitle: "",
    kind: hashtags.length === 0 ? "FOLLOWING" : "HASHTAG",
    renderer: "FEED",
    filter: { ...defaultFilter(), hashtags },
    pinned: true,
    order: opts.order ?? 0,
  };
}

describe("diffDeckColumns", () => {
  it("同一なら差分は無い", () => {
    const cols = [col("a", { order: 0 }), col("b", { order: 1 })];
    expect(diffDeckColumns(cols, cols)).toEqual([]);
  });

  it("追加・削除・変更をカラム単位で検出する", () => {
    const local = [col("a", { order: 0 }), col("b", { title: "旧タイトル", order: 1 })];
    const remote = [col("b", { title: "新タイトル", order: 0 }), col("c", { title: "追加カラム", order: 1 })];
    const diffs = diffDeckColumns(local, remote);
    expect(diffs).toContainEqual({ type: "added", spec: remote[1] });
    expect(diffs).toContainEqual({ type: "removed", spec: local[0] });
    expect(diffs).toContainEqual({ type: "changed", local: local[1], remote: remote[0] });
    // 共通カラムは b の1つだけなので並び順の差分は出ない
    expect(diffs.some((d) => d.type === "reordered")).toBe(false);
  });

  it("filter の違いも変更として検出する", () => {
    const local = [col("a", { hashtags: ["nostr"] })];
    const remote = [col("a", { hashtags: ["zap"] })];
    const diffs = diffDeckColumns(local, remote);
    expect(diffs).toEqual([{ type: "changed", local: local[0], remote: remote[0] }]);
  });

  it("並び順だけが違うときは reordered が1件だけ出る", () => {
    const local = [col("a", { order: 0 }), col("b", { order: 1 })];
    const remote = [col("b", { order: 0 }), col("a", { order: 1 })];
    expect(diffDeckColumns(local, remote)).toEqual([{ type: "reordered", remoteIdOrder: ["b", "a"] }]);
  });
});

describe("applyColumnDiffs", () => {
  it("チェックした差分だけを適用する（未選択の削除・変更はそのまま）", () => {
    const local = [col("a", { order: 0 }), col("b", { title: "旧", order: 1 })];
    const remote = [col("b", { title: "新", order: 0 }), col("c", { order: 1 })];
    const diffs = diffDeckColumns(local, remote);
    // 追加(c)だけ選択。削除(a)・変更(b)は未選択のまま
    const selected = diffs.filter((d) => d.type === "added");
    const applied = applyColumnDiffs(local, selected);
    expect([...applied.map((c) => c.id)].sort()).toEqual(["a", "b", "c"]);
    expect(applied.find((c) => c.id === "b")?.title).toBe("旧");
  });

  it("全部の差分を適用するとリモートの構成を再現する", () => {
    const local = [col("a", { order: 0 }), col("b", { title: "旧", order: 1 }), col("d", { order: 2 })];
    const remote = [
      col("c", { title: "追加", order: 0 }),
      col("b", { title: "新", order: 1 }),
      col("a", { order: 2 }),
    ];
    const diffs = diffDeckColumns(local, remote);
    const applied = applyColumnDiffs(local, diffs);
    expect(applied.map((c) => c.id)).toEqual(["c", "b", "a"]);
    expect(applied.find((c) => c.id === "b")?.title).toBe("新");
    expect(applied.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it("並び替えだけ選ぶと、ローカルだけのカラムは末尾に残る", () => {
    const local = [col("x", { order: 0 }), col("a", { order: 1 }), col("b", { order: 2 })];
    const remote = [col("b", { order: 0 }), col("a", { order: 1 })];
    const diffs = diffDeckColumns(local, remote);
    // 並び順だけ選択（x の削除は選択しない）
    const selected = diffs.filter((d) => d.type === "reordered");
    expect(applyColumnDiffs(local, selected).map((c) => c.id)).toEqual(["b", "a", "x"]);
  });

  it("削除の差分を適用するとそのカラムが消える", () => {
    const local = [col("a", { order: 0 }), col("b", { order: 1 })];
    const remote = [col("a", { order: 0 })];
    const diffs = diffDeckColumns(local, remote);
    const applied = applyColumnDiffs(
      local,
      diffs.filter((d) => d.type === "removed"),
    );
    expect(applied.map((c) => c.id)).toEqual(["a"]);
  });
});
