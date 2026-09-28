import type { NostrEvent } from "nostr-tools/pure";
import { create } from "zustand";
import { useDeck } from "../../store/deck";

/**
 * キーボード操作の状態（ネイティブ DeckState の kbActive / kbFocusColumnId / kbSelected / showShortcutsHelp）。
 * マウス操作やスクロールでは変えない（ネイティブと同じ）。カラムが消えたらその選択も消す。
 */
export type KeyboardState = {
  /** 選択ハイライトを出しているか（キー操作で true、Esc で false） */
  active: boolean;
  /** キーボードフォーカス中のカラム id（h / l で移る） */
  focusColumnId: string | null;
  /** カラム id → 選択中の行 index */
  selected: Record<string, number>;
  /** ショートカット一覧を開いているか */
  helpOpen: boolean;
};

export const INITIAL_KEYBOARD_STATE: KeyboardState = {
  active: false,
  focusColumnId: null,
  selected: {},
  helpOpen: false,
};

export const useKeyboard = create<KeyboardState>()(() => ({ ...INITIAL_KEYBOARD_STATE }));

/** カラムの一覧（仮想リスト）がキー操作のために出すもの */
export type KbList = {
  /** 行数（選択を範囲内に丸める） */
  count: number;
  /** index の行の投稿（r / t / f の対象）。投稿の行でなければ null */
  postAt(index: number): NostrEvent | null;
  /** index の行を見える位置へ寄せる（見えていれば動かさない） */
  scrollTo(index: number): void;
};

// カラム id → いま描いている一覧。関数を持つのでストアには入れない
const lists = new Map<string, KbList>();

/** カラムの一覧を登録する。戻り値で外す（後から同じカラムに登録したものは消さない） */
export function registerList(columnId: string, list: KbList): () => void {
  lists.set(columnId, list);
  return () => {
    if (lists.get(columnId) === list) lists.delete(columnId);
  };
}

export function listOf(columnId: string): KbList | undefined {
  return lists.get(columnId);
}

/** フォーカス中のカラム。未設定・消えていれば見えているカラム、無ければ先頭に決めて覚える */
export function resolveFocusColumn(): string | null {
  const { columns, visibleColumnId } = useDeck.getState();
  const current = useKeyboard.getState().focusColumnId;
  if (current !== null && columns.some((c) => c.id === current)) return current;
  const id = columns.find((c) => c.id === visibleColumnId)?.id ?? columns[0]?.id ?? null;
  useKeyboard.setState({ focusColumnId: id });
  return id;
}

/** 選択を delta ぶん動かす（範囲内に丸める）。行が無ければ何もしない（ネイティブ kbMoveSelection） */
export function moveSelection(columnId: string, delta: number): void {
  const count = listOf(columnId)?.count ?? 0;
  if (count === 0) return;
  const { selected } = useKeyboard.getState();
  const next = Math.min(Math.max((selected[columnId] ?? -1) + delta, 0), count - 1);
  useKeyboard.setState({ selected: { ...selected, [columnId]: next }, active: true });
  listOf(columnId)?.scrollTo(next);
}

/** 選択を先頭 / 末尾へ（ネイティブ kbSelectEdge） */
export function selectEdge(columnId: string, toBottom: boolean): void {
  const count = listOf(columnId)?.count ?? 0;
  if (count === 0) return;
  const { selected } = useKeyboard.getState();
  const next = toBottom ? count - 1 : 0;
  useKeyboard.setState({ selected: { ...selected, [columnId]: next }, active: true });
  listOf(columnId)?.scrollTo(next);
}

/** position 番目のカラムへフォーカスを移してそこへスクロールする。移った先に選択が無ければ 0（ネイティブ kbFocusColumn） */
export function focusColumn(position: number): void {
  const deck = useDeck.getState();
  if (deck.columns.length === 0) return;
  const id = deck.columns[Math.min(Math.max(position, 0), deck.columns.length - 1)].id;
  const { selected } = useKeyboard.getState();
  const index = selected[id] ?? 0;
  useKeyboard.setState({ focusColumnId: id, active: true, selected: { ...selected, [id]: index } });
  deck.jumpTo(id);
  listOf(id)?.scrollTo(index);
}

/** 選択中の行（フォーカス中のカラムで、選択ハイライトを出しているときだけ）。無ければ -1 */
export function selectedIndexOf(s: KeyboardState, columnId: string | null): number {
  if (columnId === null || !s.active || s.focusColumnId !== columnId) return -1;
  return s.selected[columnId] ?? -1;
}

export function setHelpOpen(open: boolean): void {
  useKeyboard.setState({ helpOpen: open });
}

// カラムを消したら選択も消す（フォーカス中のカラムなら次のキーで選び直す）
useDeck.subscribe((s, prev) => {
  if (s.columns === prev.columns) return;
  const ids = new Set(s.columns.map((c) => c.id));
  const kb = useKeyboard.getState();
  const stale = Object.keys(kb.selected).filter((id) => !ids.has(id));
  const focusGone = kb.focusColumnId !== null && !ids.has(kb.focusColumnId);
  if (stale.length === 0 && !focusGone) return;
  const selected = { ...kb.selected };
  for (const id of stale) delete selected[id];
  useKeyboard.setState({ selected, focusColumnId: focusGone ? null : kb.focusColumnId });
});
