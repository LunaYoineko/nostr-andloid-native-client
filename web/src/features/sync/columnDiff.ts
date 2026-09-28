import { type ColumnSpec, encodeReqFilter, sortByOrder } from "../../lib/columns";

/**
 * [#468] カラム構成の差分計算・適用（純関数）。ネイティブ SettingsSync.kt の
 * diffDeckColumns / applyColumnDiffs / ColumnDiff の写し。
 */

/** カラム構成の差分（カラム単位）。 */
export type ColumnDiff =
  | { type: "added"; spec: ColumnSpec }
  | { type: "removed"; spec: ColumnSpec }
  | { type: "changed"; local: ColumnSpec; remote: ColumnSpec }
  | { type: "reordered"; remoteIdOrder: readonly string[] };

/** カラム内容の同一性（並び順・pinned は見ない。filter は既定を省いた形で比べる）。 */
function sameColumnContent(a: ColumnSpec, b: ColumnSpec): boolean {
  return (
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.kind === b.kind &&
    a.renderer === b.renderer &&
    encodeReqFilter(a.filter) === encodeReqFilter(b.filter)
  );
}

/**
 * カラム構成の差分を計算する。id で突き合わせ、追加/削除/変更をカラム単位で返す。
 * 双方に存在するカラムの並び順が違うときだけ Reordered を1件加える。
 */
export function diffDeckColumns(local: readonly ColumnSpec[], remote: readonly ColumnSpec[]): ColumnDiff[] {
  const localSorted = sortByOrder(local);
  const remoteSorted = sortByOrder(remote);
  const localById = new Map(localSorted.map((c) => [c.id, c]));
  const remoteById = new Map(remoteSorted.map((c) => [c.id, c]));
  const diffs: ColumnDiff[] = [];

  for (const r of remoteSorted) if (!localById.has(r.id)) diffs.push({ type: "added", spec: r });
  for (const l of localSorted) if (!remoteById.has(l.id)) diffs.push({ type: "removed", spec: l });
  for (const l of localSorted) {
    const r = remoteById.get(l.id);
    if (r && !sameColumnContent(l, r)) diffs.push({ type: "changed", local: l, remote: r });
  }

  const commonLocalOrder = localSorted.map((c) => c.id).filter((id) => remoteById.has(id));
  const commonRemoteOrder = remoteSorted.map((c) => c.id).filter((id) => localById.has(id));
  if (commonLocalOrder.join("\n") !== commonRemoteOrder.join("\n")) {
    diffs.push({ type: "reordered", remoteIdOrder: remoteSorted.map((c) => c.id) });
  }
  return diffs;
}

/**
 * チェックされた差分だけをローカル構成へ適用した結果を返す。
 *  - added: リモートの並び位置を尊重して追加（reordered 未選択でも末尾ではなく近い位置へ）。
 *  - removed: 取り除く。changed: 位置は維持して内容だけリモート版へ（pinned にする）。
 *  - reordered: 共通カラムをリモートの並びへ。リモートに無いカラムは末尾（ローカル順）。
 * order は最後に 0..n-1 へ振り直す。
 */
export function applyColumnDiffs(
  local: readonly ColumnSpec[],
  selected: readonly ColumnDiff[],
): ColumnSpec[] {
  let result = sortByOrder(local);

  const removedIds = new Set(
    selected.filter((d) => d.type === "removed").map((d) => (d as { spec: ColumnSpec }).spec.id),
  );
  if (removedIds.size > 0) result = result.filter((c) => !removedIds.has(c.id));

  const changedById = new Map(
    selected
      .filter((d) => d.type === "changed")
      .map((d) => d as { local: ColumnSpec; remote: ColumnSpec })
      .map((d) => [d.local.id, d.remote]),
  );
  if (changedById.size > 0) {
    result = result.map((c) => {
      const remote = changedById.get(c.id);
      return remote ? { ...remote, pinned: true } : c;
    });
  }

  const added = selected
    .filter((d): d is { type: "added"; spec: ColumnSpec } => d.type === "added")
    .sort((a, b) => a.spec.order - b.spec.order);
  for (const d of added) {
    if (result.some((c) => c.id === d.spec.id)) continue;
    const pos = Math.min(Math.max(d.spec.order, 0), result.length);
    result = [...result.slice(0, pos), { ...d.spec, pinned: true }, ...result.slice(pos)];
  }

  const reordered = selected.find(
    (d): d is { type: "reordered"; remoteIdOrder: readonly string[] } => d.type === "reordered",
  );
  if (reordered) {
    const pos = new Map(reordered.remoteIdOrder.map((id, i) => [id, i]));
    const inRemote = result
      .filter((c) => pos.has(c.id))
      .map((c) => ({ c, i: pos.get(c.id) ?? 0 }))
      .sort((a, b) => a.i - b.i)
      .map(({ c }) => c);
    const rest = result.filter((c) => !pos.has(c.id));
    result = [...inRemote, ...rest];
  }

  return result.map((s, i) => (s.order === i ? s : { ...s, order: i }));
}
