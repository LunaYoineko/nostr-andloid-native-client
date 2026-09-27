import { EventStore } from "applesauce-core/event-store";
import { verifyEvent } from "nostr-tools/pure";

/**
 * アプリで 1 つのイベントストア（メモリ上の正本）。画面はリレーではなくここを読む。
 * 署名検証は nostr-tools の verifyEvent（DB から戻したイベントは検証済みの印が付くので再検証しない）。
 * kind:5 の削除は既定どおり反映される。
 */
export const eventStore = new EventStore({ verifyEvent });
