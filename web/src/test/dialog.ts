/**
 * jsdom は <dialog> の showModal / close を持たないので、開閉と close イベントだけを足す（#452 のテストと同じ）。
 * cancel（Esc / 戻る）はテストから `new Event("cancel", { cancelable: true })` を dispatch する。
 */
export function installDialogPolyfill(): void {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}
