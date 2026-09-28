import type { WindowNostr } from "nostr-tools/nip07";

// NIP-07 拡張（nos2x / Alby / Nostash 等）がページに注入する window.nostr の型
declare global {
  interface Window {
    nostr?: WindowNostr;
  }
}

/**
 * window.nostr が現れるまで待つ。拡張は読み込み後に遅れて注入することがあるため、
 * timeoutMs の間 intervalMs ごとに確認する。見つからなければ null。
 */
export function waitForNostr(timeoutMs = 1500, intervalMs = 100): Promise<WindowNostr | null> {
  if (window.nostr) return Promise.resolve(window.nostr);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      // テストの後片付けなどで window が無くなったら待つのをやめる（未処理の例外にしない）
      if (typeof window === "undefined") {
        clearInterval(timer);
        resolve(null);
        return;
      }
      if (window.nostr) {
        clearInterval(timer);
        resolve(window.nostr);
      } else if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, intervalMs);
  });
}
