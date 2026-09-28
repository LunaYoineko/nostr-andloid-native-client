import { EventStore, type IEventStoreActions } from "applesauce-core/event-store";
import { type NostrEvent, verifyEvent } from "nostr-tools/pure";

/**
 * アプリで 1 つのイベントストア（メモリ上の正本）。画面はリレーではなくここを読む。
 * 署名検証は nostr-tools の verifyEvent（DB から戻したイベントは検証済みの印が付くので再検証しない）。
 * イベントは eventStore.add を直接呼ばず addVerified で入れる（kind:5 の検証のため）。
 */
export const eventStore = new EventStore({ verifyEvent });

/**
 * store へイベントを入れる。kind:5 は署名が正しいときだけ入れる。
 * applesauce-core 6.2 の add は kind:5 を署名検証の前に削除として適用するため、
 * pubkey だけ偽った kind:5 でそのユーザーのイベントが消えるのを防ぐ。
 * @returns add の戻り値。署名不正の kind:5 は入れずに null
 */
export function addVerifiedTo(store: EventStore, event: NostrEvent, from?: string): NostrEvent | null {
  if (event.kind === 5 && !verifyEvent(event)) return null;
  return store.add(event, from);
}

/** アプリのストアへイベントを入れる（kind:5 は署名が正しいときだけ） */
export function addVerified(event: NostrEvent, from?: string): NostrEvent | null {
  return addVerifiedTo(eventStore, event, from);
}

/** applesauce のローダへ渡すストア操作。add を addVerified に替えたもの */
export const verifiedStoreActions: IEventStoreActions = {
  add: (event) => addVerified(event),
  remove: (event) => eventStore.remove(event),
  update: (event) => eventStore.update(event),
};
