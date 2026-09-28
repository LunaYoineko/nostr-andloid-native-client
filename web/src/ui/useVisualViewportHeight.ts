import type { RefObject } from "react";
import { useEffect } from "react";

/**
 * ソフトキーボードで縮んだ「見えている高さ」（`window.visualViewport.height`）を、
 * 指定した要素の CSS カスタムプロパティへ反映する（ComposeDialog の `--compose-vvh` を切り出したもの）。
 * resize のたびに追従し、visualViewport が無い環境（デスクトップ・jsdom 等）では何もしない
 * （呼び出し側の CSS が `var(--foo, 既定値)` でフォールバックする）。
 */
export function useVisualViewportHeight(target: RefObject<HTMLElement | null>, property: string): void {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = target.current;
    if (!vv || !el) return;
    const apply = () => el.style.setProperty(property, `${vv.height}px`);
    apply();
    vv.addEventListener("resize", apply);
    return () => vv.removeEventListener("resize", apply);
  }, [target, property]);
}
