import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_COLUMNS } from "../../lib/columns";
import { useDeck } from "../../store/deck";
import {
  focusColumn,
  INITIAL_KEYBOARD_STATE,
  type KbList,
  listOf,
  moveSelection,
  registerList,
  resolveFocusColumn,
  selectEdge,
  selectedIndexOf,
  useKeyboard,
} from "./kbStore";

const POST = finalizeEvent(
  { kind: 1, created_at: 1_700_000_000, tags: [], content: "投稿" },
  generateSecretKey(),
);

/** posts = 投稿の行（選べる行）の index。省略 = すべて */
function fakeList(count: number, posts?: readonly number[]): KbList {
  const isPost = (i: number) => i >= 0 && i < count && (posts === undefined || posts.includes(i));
  return { count, postAt: (i) => (isPost(i) ? POST : null), selectable: isPost, scrollTo: vi.fn() };
}

beforeEach(() => {
  localStorage.clear();
  useDeck.setState({
    columns: structuredClone([...DEFAULT_COLUMNS]),
    widths: {},
    jumpTarget: null,
    visibleColumnId: null,
  });
  useKeyboard.setState({ ...INITIAL_KEYBOARD_STATE });
});

it("選択を動かすと範囲内に丸め、ハイライトを出し、その行へ寄せる。行が無ければ何もしない", () => {
  const list = fakeList(3);
  const unregister = registerList("c_following", list);
  moveSelection("c_following", 1);
  expect(useKeyboard.getState()).toMatchObject({ active: true, selected: { c_following: 0 } });
  expect(list.scrollTo).toHaveBeenLastCalledWith(0);
  moveSelection("c_following", 5);
  expect(useKeyboard.getState().selected.c_following).toBe(2);
  moveSelection("c_following", -9);
  expect(useKeyboard.getState().selected.c_following).toBe(0);
  selectEdge("c_following", true);
  expect(useKeyboard.getState().selected.c_following).toBe(2);
  expect(list.scrollTo).toHaveBeenLastCalledWith(2);
  unregister();
  expect(listOf("c_following")).toBeUndefined();

  useKeyboard.setState({ ...INITIAL_KEYBOARD_STATE });
  moveSelection("c_following", 1);
  expect(useKeyboard.getState()).toMatchObject({ active: false, selected: {} });
});

it("選べない行（混在の通知など）は飛ばし、端で止まる。先頭 / 末尾も選べる行", () => {
  const list = fakeList(6, [1, 2, 5]);
  const unregister = registerList("c_following", list);
  moveSelection("c_following", 1);
  expect(useKeyboard.getState().selected.c_following).toBe(1);
  moveSelection("c_following", 1);
  moveSelection("c_following", 1);
  expect(useKeyboard.getState().selected.c_following).toBe(5);
  moveSelection("c_following", 1);
  expect(useKeyboard.getState().selected.c_following).toBe(5);
  moveSelection("c_following", -1);
  expect(useKeyboard.getState().selected.c_following).toBe(2);
  selectEdge("c_following", false);
  expect(useKeyboard.getState().selected.c_following).toBe(1);
  selectEdge("c_following", true);
  expect(useKeyboard.getState().selected.c_following).toBe(5);
  // 移った先に選択が無ければ先頭の選べる行
  useKeyboard.setState({ selected: {} });
  focusColumn(0);
  expect(useKeyboard.getState().selected.c_following).toBe(1);
  unregister();
});

it("登録を外しても、後から同じカラムに登録したものは残す", () => {
  const first = fakeList(1);
  const second = fakeList(2);
  const unregisterFirst = registerList("c_following", first);
  const unregisterSecond = registerList("c_following", second);
  unregisterFirst();
  expect(listOf("c_following")).toBe(second);
  unregisterSecond();
});

it("フォーカスは未設定なら見えているカラム、無ければ先頭に決めて覚える", () => {
  expect(resolveFocusColumn()).toBe("c_following");
  useKeyboard.setState({ focusColumnId: null });
  useDeck.setState({ visibleColumnId: "c_notif" });
  expect(resolveFocusColumn()).toBe("c_notif");
  expect(useKeyboard.getState().focusColumnId).toBe("c_notif");
  // 覚えたあとはスクロールで変えない
  useDeck.setState({ visibleColumnId: "c_hashtag" });
  expect(resolveFocusColumn()).toBe("c_notif");
});

it("カラムを移ると選択が無ければ 0 にし、そこへ jump する。端で丸める", () => {
  focusColumn(1);
  expect(useKeyboard.getState()).toMatchObject({
    focusColumnId: "c_hashtag",
    active: true,
    selected: { c_hashtag: 0 },
  });
  expect(useDeck.getState().jumpTarget).toBe("c_hashtag");
  useKeyboard.setState({ selected: { c_notif: 4 } });
  focusColumn(9);
  expect(useKeyboard.getState()).toMatchObject({ focusColumnId: "c_notif", selected: { c_notif: 4 } });
});

it("選択中の行はフォーカス中のカラムで、ハイライトを出しているときだけ", () => {
  const s = { ...INITIAL_KEYBOARD_STATE, focusColumnId: "c_following", selected: { c_following: 2 } };
  expect(selectedIndexOf(s, "c_following")).toBe(-1);
  expect(selectedIndexOf({ ...s, active: true }, "c_following")).toBe(2);
  expect(selectedIndexOf({ ...s, active: true }, "c_hashtag")).toBe(-1);
  expect(selectedIndexOf({ ...s, active: true }, null)).toBe(-1);
});

it("カラムを消したら選択も消し、フォーカス中なら外す", () => {
  useKeyboard.setState({ focusColumnId: "c_hashtag", selected: { c_following: 1, c_hashtag: 2 } });
  useDeck.getState().removeColumn("c_hashtag");
  expect(useKeyboard.getState()).toMatchObject({ focusColumnId: null, selected: { c_following: 1 } });
  expect(useKeyboard.getState().selected).not.toHaveProperty("c_hashtag");
});
