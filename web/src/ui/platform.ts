/**
 * iOS 判定（#598）。iPadOS 13+ は navigator.platform が Mac と同じ "MacIntel" になるため、
 * タッチ対応（maxTouchPoints）で Mac 実機と区別する。
 */
export function isIOS(nav: Pick<Navigator, "platform" | "maxTouchPoints"> = navigator): boolean {
  const platform = nav.platform ?? "";
  if (/^iP(hone|ad|od)/.test(platform)) return true;
  return platform === "MacIntel" && nav.maxTouchPoints > 1;
}

/**
 * <html> に data-os="ios" を付ける（iOS 以外は付けない）。BottomNav.module.css の
 * `:root[data-os="ios"]` で、下部ナビの下端インセットを iOS だけ 26px 詰める分岐に使う。
 * main.tsx の先頭で React の描画前に 1 度だけ呼ぶ。
 */
export function applyOsAttribute(nav: Pick<Navigator, "platform" | "maxTouchPoints"> = navigator): void {
  const root = document.documentElement;
  if (isIOS(nav)) {
    root.dataset.os = "ios";
  } else {
    delete root.dataset.os;
  }
}
