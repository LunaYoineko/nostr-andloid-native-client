import { EventStore } from "applesauce-core/event-store";

/**
 * アプリで 1 つのイベントストア（メモリ上の正本）。画面はリレーではなくここを読む。
 * 署名検証は applesauce の既定（nostr-tools の verifyEvent）のまま。kind:5 の削除も既定どおり反映される。
 */
export const eventStore = new EventStore();
