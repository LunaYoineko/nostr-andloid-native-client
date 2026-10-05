import { type RefObject, useEffect } from "react";
import { useNavigate } from "react-router";

/** 押したときに自分の動作を持つ要素（ここを押したときはノートを開かない）。data-no-open は自前で開閉するカード（X の投稿カード） */
const INTERACTIVE =
  "a, button, input, textarea, select, label, summary, video, audio, iframe, dialog, [role='button'], [role='menu'], [contenteditable], [data-no-open]";

/**
 * 要素全体のクリックで href へ移動する（ネイティブの NoteItem.kt の clickable = スレッドを開く）。
 * リンク・ボタン等の上、修飾キー付き・左以外のボタン、文字を選択しているときは何もしない。
 * JSX の onClick は a11y 規則に当たるので DOM のリスナーで付ける（キーボードの入口は時刻のリンク）。
 */
export function useOpenOnClick(ref: RefObject<HTMLElement | null>, href: string | null): void {
  const navigate = useNavigate();
  useEffect(() => {
    const element = ref.current;
    if (!element || href === null) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest(INTERACTIVE) !== null) return;
      if ((window.getSelection()?.toString() ?? "") !== "") return;
      navigate(href);
    };
    element.addEventListener("click", onClick);
    return () => element.removeEventListener("click", onClick);
  }, [ref, href, navigate]);
}
