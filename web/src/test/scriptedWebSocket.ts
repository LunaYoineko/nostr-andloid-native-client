import type { Filter } from "applesauce-core/helpers/filter";

/**
 * リレー側をテストから操作できる WebSocket の偽物（実際には繋がない）。
 * vi.stubGlobal("WebSocket", ScriptedWebSocket) の後に作られたリレーの接続がこれになる（作られた順に sockets へ入る）。
 * accept = 接続の確立、push = リレーからのメッセージ、drop = 異常切断。クライアントが送ったものは sent
 */
export class ScriptedWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static readonly sockets: ScriptedWebSocket[] = [];
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
  /** クライアントが送ったメッセージ（JSON を読んだもの） */
  readonly sent: unknown[][] = [];

  constructor(readonly url: string) {
    super();
    ScriptedWebSocket.sockets.push(this);
  }

  /** url へのいちばん新しい接続 */
  static latest(url: string): ScriptedWebSocket | undefined {
    return ScriptedWebSocket.sockets.filter((s) => s.url === url).at(-1);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as unknown[]);
  }

  /** クライアントから閉じる（ブラウザと同じく close イベントは後で届く） */
  close(code = 1000, reason = "") {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    queueMicrotask(() => {
      this.readyState = 3;
      this.onclose?.({ wasClean: true, code, reason } as CloseEvent);
    });
  }

  accept() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  push(message: unknown[]) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }

  drop() {
    this.readyState = 3;
    this.onclose?.({ wasClean: false, code: 1006, reason: "" } as CloseEvent);
  }

  /** 送られた REQ（id とフィルタ） */
  reqs(): { id: string; filters: Filter[] }[] {
    return this.sent
      .filter((m) => m[0] === "REQ")
      .map((m) => ({ id: m[1] as string, filters: m.slice(2) as Filter[] }));
  }

  /** 送られた AUTH のイベント */
  auths(): { id: string; kind: number; tags: string[][] }[] {
    return this.sent
      .filter((m) => m[0] === "AUTH")
      .map((m) => m[1] as { id: string; kind: number; tags: string[][] });
  }
}
