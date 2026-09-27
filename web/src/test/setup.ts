import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * テストではリレーへ実際に接続しない。jsdom の WebSocket は本物の通信をするので、
 * 接続しないまま（CONNECTING のまま）の偽物に差し替える。RelayPool はモジュール読み込み時ではなく
 * 購読時にソケットを作るため、テストファイルの import より前に走るここで差し替えれば足りる。
 */
class OfflineWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = 0;
  binaryType: BinaryType = "blob";
  bufferedAmount = 0;
  extensions = "";
  protocol = "";
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  constructor(readonly url: string | URL) {
    super();
  }

  send() {}

  close() {
    this.readyState = 3;
  }
}
globalThis.WebSocket = OfflineWebSocket as unknown as typeof WebSocket;

/**
 * jsdom の TextEncoder は別 realm の Uint8Array を返すため、nostr-tools（@noble/hashes）の
 * `instanceof Uint8Array` 判定に落ちてイベント ID の計算・署名検証ができない。こちらの realm で包み直す。
 */
const JsdomTextEncoder = globalThis.TextEncoder;
globalThis.TextEncoder = class extends JsdomTextEncoder {
  encode(input?: string) {
    return new Uint8Array(super.encode(input));
  }
};

// globals を有効にしていないので、描画した DOM の後始末を明示する
afterEach(() => {
  cleanup();
});
