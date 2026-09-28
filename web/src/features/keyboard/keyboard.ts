/**
 * デッキのキーボードショートカット（ネイティブ KeyboardShortcuts.kt の handleDeckKey）。キー → 動作の対応だけを持つ純関数。
 * 実行は KeyboardShortcuts（window の keydown を 1 か所で受ける）が行う。
 */
export type KeyAction =
  /** フォーカス中カラムの選択を ±1（j / k / ↓ / ↑） */
  | { type: "move"; delta: 1 | -1 }
  /** 左右のカラムへ（h / l / ← / →） */
  | { type: "column"; delta: 1 | -1 }
  /** 先頭 / 末尾（g / G / .） */
  | { type: "edge"; toBottom: boolean }
  /** スレッドを開く（Enter / o。行の行き先へ） */
  | { type: "open" }
  /** 返信（r） */
  | { type: "reply" }
  /** 引用（t。ネイティブは onRepost = doQuote） */
  | { type: "quote" }
  /** 既定リアクションのトグル（f） */
  | { type: "react" }
  /** ブックマークのトグル（b。#531） */
  | { type: "bookmark" }
  /** 新規投稿（n） */
  | { type: "compose" }
  /** 検索画面へ移って検索欄にフォーカス（/） */
  | { type: "search" }
  /** 一覧の開閉（?） */
  | { type: "toggleHelp" }
  /** Esc: 一覧を閉じる */
  | { type: "closeHelp" }
  /** Esc: 詳細（スレッド / プロフィール）を閉じる。閉じるのは DetailOverlay 自身の Esc */
  | { type: "closeDetail" }
  /** Esc: 選択ハイライトを消す */
  | { type: "deselect" };

/** keyToAction が読むキーイベントの部分（KeyboardEvent をそのまま渡せる） */
export type KeyInput = Pick<
  KeyboardEvent,
  "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "isComposing" | "defaultPrevented" | "target"
> & { keyCode?: number };

export type KeyContext = {
  /** 投稿シート・ダイアログ・ライトボックス・メニューのどれかが開いている（一覧は除く） */
  modalOpen: boolean;
  /** ショートカット一覧を開いている */
  helpOpen: boolean;
  /** 詳細（スレッド / プロフィール）を重ねている */
  hasDetail: boolean;
  /** 選択ハイライトを出している */
  kbActive: boolean;
};

/** 文字入力を受ける要素（ここにフォーカスがあるときは何もしない） */
const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/** Enter で自分の動作をする要素（フォーカスがあるときは Enter をブラウザに任せる） */
const ACTIVATABLE =
  "a[href], button, summary, [role='button'], [role='link'], [role='menuitem'], [role='tab']";

function closestMatch(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}

/**
 * キー → 動作。次のときは null（イベントも止めない）:
 * 既に処理済み（タブ列の ←→ 等）、IME 変換中、Ctrl / ⌘ / Alt 付き（ブラウザの Ctrl/⌘+R 等を奪わない）、
 * 入力欄にフォーカス、投稿シート・ダイアログ等が開いている。一覧を開いている間は ? と Esc だけ。
 * 文字キーは大文字小文字を区別しない（CapsLock でも効く）。g と G は Shift で分ける。
 */
export function keyToAction(event: KeyInput, context: KeyContext): KeyAction | null {
  if (event.defaultPrevented) return null;
  // Safari は変換確定の keydown で isComposing が false のまま keyCode 229 を送る
  if (event.isComposing || event.key === "Process" || event.keyCode === 229) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (closestMatch(event.target, EDITABLE)) return null;
  if (context.modalOpen) return null;

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (context.helpOpen) {
    if (key === "?") return { type: "toggleHelp" };
    if (key === "Escape") return { type: "closeHelp" };
    return null;
  }

  switch (key) {
    case "j":
    case "ArrowDown":
      return { type: "move", delta: 1 };
    case "k":
    case "ArrowUp":
      return { type: "move", delta: -1 };
    case "l":
    case "ArrowRight":
      return { type: "column", delta: 1 };
    case "h":
    case "ArrowLeft":
      return { type: "column", delta: -1 };
    case "g":
      return { type: "edge", toBottom: event.shiftKey };
    case ".":
      return { type: "edge", toBottom: false };
    case "Enter":
      // ボタン・リンクにフォーカスがあるときは、それを押す（ブラウザの既定）
      return closestMatch(event.target, ACTIVATABLE) ? null : { type: "open" };
    case "o":
      return { type: "open" };
    case "r":
      return { type: "reply" };
    case "t":
      return { type: "quote" };
    case "f":
      return { type: "react" };
    case "b":
      return { type: "bookmark" };
    case "n":
      return { type: "compose" };
    case "/":
      return { type: "search" };
    case "?":
      return { type: "toggleHelp" };
    case "Escape":
      if (context.hasDetail) return { type: "closeDetail" };
      if (context.kbActive) return { type: "deselect" };
      return null;
    default:
      return null;
  }
}
