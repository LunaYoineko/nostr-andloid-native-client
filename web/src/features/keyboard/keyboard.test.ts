import { afterEach, describe, expect, it } from "vitest";
import { type KeyContext, type KeyInput, keyToAction } from "./keyboard";

const CONTEXT: KeyContext = { modalOpen: false, helpOpen: false, hasDetail: false, kbActive: false };

/** body で押したキー（修飾キー無し・IME 変換中でない） */
function key(k: string, extra: Partial<KeyInput> = {}): KeyInput {
  return {
    key: k,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    defaultPrevented: false,
    target: document.body,
    ...extra,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

function inElement(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  document.body.append(el);
  return el;
}

describe("何もしない", () => {
  it("入力欄（input / textarea / select / contenteditable）にフォーカスがあるときは null", () => {
    const editor = inElement("div", { contenteditable: "true" });
    const child = document.createElement("span");
    editor.append(child);
    for (const target of [inElement("input"), inElement("textarea"), inElement("select"), editor, child]) {
      expect(keyToAction(key("j", { target }), CONTEXT)).toBeNull();
      expect(keyToAction(key("Escape", { target }), { ...CONTEXT, kbActive: true })).toBeNull();
    }
  });

  it("IME 変換中（isComposing / keyCode 229 / Process）は null", () => {
    expect(keyToAction(key("j", { isComposing: true }), CONTEXT)).toBeNull();
    expect(keyToAction(key("j", { keyCode: 229 }), CONTEXT)).toBeNull();
    expect(keyToAction(key("Process"), CONTEXT)).toBeNull();
  });

  it("Ctrl / ⌘ / Alt 付きは null（ブラウザの Ctrl/⌘+R 等を奪わない）", () => {
    expect(keyToAction(key("r", { ctrlKey: true }), CONTEXT)).toBeNull();
    expect(keyToAction(key("r", { metaKey: true }), CONTEXT)).toBeNull();
    expect(keyToAction(key("j", { altKey: true }), CONTEXT)).toBeNull();
    expect(keyToAction(key("Enter", { metaKey: true }), CONTEXT)).toBeNull();
  });

  it("投稿シート・ダイアログ・ライトボックス・メニューが開いているときは null（Esc・? も）", () => {
    const modal = { ...CONTEXT, modalOpen: true, kbActive: true };
    for (const k of ["j", "n", "?", "Escape", "Enter"]) expect(keyToAction(key(k), modal)).toBeNull();
  });

  it("既に処理済み（タブ列の ←→ 等）なら null", () => {
    expect(keyToAction(key("ArrowRight", { defaultPrevented: true }), CONTEXT)).toBeNull();
  });

  it("ボタン・リンクにフォーカスがあるときの Enter は null（押すのはブラウザ）。o は効く", () => {
    const button = inElement("button");
    expect(keyToAction(key("Enter", { target: button }), CONTEXT)).toBeNull();
    expect(keyToAction(key("o", { target: button }), CONTEXT)).toEqual({ type: "open" });
    expect(keyToAction(key("j", { target: button }), CONTEXT)).toEqual({ type: "move", delta: 1 });
  });

  it("割り当ての無いキーは null", () => {
    for (const k of ["a", " ", "Tab", "Home", "End", "PageDown"])
      expect(keyToAction(key(k), CONTEXT)).toBeNull();
  });
});

describe("割り当て（ネイティブ handleDeckKey と同じ）", () => {
  it.each([
    ["j", { type: "move", delta: 1 }],
    ["ArrowDown", { type: "move", delta: 1 }],
    ["k", { type: "move", delta: -1 }],
    ["ArrowUp", { type: "move", delta: -1 }],
    ["l", { type: "column", delta: 1 }],
    ["ArrowRight", { type: "column", delta: 1 }],
    ["h", { type: "column", delta: -1 }],
    ["ArrowLeft", { type: "column", delta: -1 }],
    [".", { type: "edge", toBottom: false }],
    ["Enter", { type: "open" }],
    ["o", { type: "open" }],
    ["r", { type: "reply" }],
    ["t", { type: "quote" }],
    ["f", { type: "react" }],
    ["b", { type: "bookmark" }],
    ["n", { type: "compose" }],
    ["/", { type: "search" }],
  ])("%s", (k, action) => {
    expect(keyToAction(key(k), CONTEXT)).toEqual(action);
  });

  it("? は一覧の開閉（Shift 付きで来る）", () => {
    expect(keyToAction(key("?", { shiftKey: true }), CONTEXT)).toEqual({ type: "toggleHelp" });
  });

  it("g は先頭、G（Shift+g）は末尾。CapsLock の G（Shift 無し）は先頭", () => {
    expect(keyToAction(key("g"), CONTEXT)).toEqual({ type: "edge", toBottom: false });
    expect(keyToAction(key("G", { shiftKey: true }), CONTEXT)).toEqual({ type: "edge", toBottom: true });
    expect(keyToAction(key("G"), CONTEXT)).toEqual({ type: "edge", toBottom: false });
  });

  it("CapsLock の大文字でも効く", () => {
    expect(keyToAction(key("J"), CONTEXT)).toEqual({ type: "move", delta: 1 });
    expect(keyToAction(key("N"), CONTEXT)).toEqual({ type: "compose" });
  });
});

describe("Esc の閉じる順: 一覧 → 詳細 → 選択解除", () => {
  it("一覧を開いていれば一覧を閉じる（詳細・選択があっても）", () => {
    const context = { ...CONTEXT, helpOpen: true, hasDetail: true, kbActive: true };
    expect(keyToAction(key("Escape"), context)).toEqual({ type: "closeHelp" });
  });

  it("一覧が無ければ詳細を閉じる", () => {
    expect(keyToAction(key("Escape"), { ...CONTEXT, hasDetail: true, kbActive: true })).toEqual({
      type: "closeDetail",
    });
  });

  it("詳細も無ければ選択を解除する", () => {
    expect(keyToAction(key("Escape"), { ...CONTEXT, kbActive: true })).toEqual({ type: "deselect" });
  });

  it("閉じるものが無ければ null", () => {
    expect(keyToAction(key("Escape"), CONTEXT)).toBeNull();
  });

  it("一覧を開いている間は ? と Esc だけ", () => {
    const context = { ...CONTEXT, helpOpen: true };
    expect(keyToAction(key("?", { shiftKey: true }), context)).toEqual({ type: "toggleHelp" });
    for (const k of ["j", "n", "Enter", "/"]) expect(keyToAction(key(k), context)).toBeNull();
  });
});
