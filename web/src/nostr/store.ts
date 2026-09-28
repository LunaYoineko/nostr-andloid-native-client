import { EventStore, type IEventStoreActions } from "applesauce-core/event-store";
import { type NostrEvent, verifyEvent } from "nostr-tools/pure";
import { Subject } from "rxjs";

/**
 * アプリで 1 つのイベントストア（メモリ上の正本）。画面はリレーではなくここを読む。
 * 署名検証は nostr-tools の verifyEvent（DB から戻したイベントは検証済みの印が付くので再検証しない）。
 * イベントは eventStore.add を直接呼ばず addVerified で入れる（kind:5 の検証のため）。
 */
export const eventStore = new EventStore({ verifyEvent });

// ---- 削除の記憶（NIP-09 kind:5。#579）。ネイティブの deleted_event / deleted_addr と同じ意味。
// EventStore（applesauce の DeleteManager）はセッション中だけ覚えているので、再読み込みやリレーからの
// 再取得で消したはずのものが戻る。ここでは reload をまたいで効く記録を、DB 層（db/persistence.ts）と
// 分けて持つ：このモジュールはメモリの正本と判定だけを持ち、DB への読み書きは deletionRecorded$ 経由で行う。

/** 記録した削除（DB 層が deletedEvents / deletedAddrs へ書くために購読する） */
export type DeletionRecord =
  | { type: "event"; id: string; deletedAt: number }
  | { type: "addr"; coord: string; deletedAt: number };

const deletedEventIds = new Set<string>();
/** 座標 "<kind>:<pubkey>:<d>" → 削除リクエストの created_at */
const deletedAddrAt = new Map<string, number>();
const deletionRecordedSubject = new Subject<DeletionRecord>();
/** 新しく確定した削除の記録（DB 層が永続化のために購読する） */
export const deletionRecorded$ = deletionRecordedSubject.asObservable();

function addrCoord(kind: number, pubkey: string, d: string): string {
  return `${kind}:${pubkey}:${d}`;
}

/** addressable(30000-39999) か */
function isAddressableKind(kind: number): boolean {
  return kind >= 30000 && kind <= 39999;
}

/** d タグの値（無ければ空文字。ネイティブと同じ） */
function dTagOf(event: NostrEvent): string {
  return event.tags.find((t) => t[0] === "d")?.[1] ?? "";
}

/**
 * 起動時に IndexedDB の削除記録をメモリへ読み込む（db 層の hydrate 前に呼ぶ）。
 * 呼ぶたびに加算する（呼び直しても壊れないが、通常は起動時に 1 度）。
 */
export function loadDeletionMemory(
  events: Iterable<{ id: string }>,
  addrs: Iterable<{ coord: string; deletedAt: number }>,
): void {
  for (const row of events) deletedEventIds.add(row.id);
  for (const row of addrs) deletedAddrAt.set(row.coord, row.deletedAt);
}

/** 記録済みの id / 座標か（addVerifiedTo・hydrate で弾くための判定） */
function isDeletedLocally(event: NostrEvent): boolean {
  if (event.kind !== 5 && deletedEventIds.has(event.id)) return true;
  if (isAddressableKind(event.kind)) {
    const at = deletedAddrAt.get(addrCoord(event.kind, event.pubkey, dTagOf(event)));
    if (at !== undefined && event.created_at <= at) return true;
  }
  return false;
}

function markEventDeletedLocally(id: string, deletedAt: number): void {
  deletedEventIds.add(id);
  deletionRecordedSubject.next({ type: "event", id, deletedAt });
}

function markAddrDeletedLocally(kind: number, pubkey: string, d: string, deletedAt: number): void {
  const coord = addrCoord(kind, pubkey, d);
  deletedAddrAt.set(coord, deletedAt);
  deletionRecordedSubject.next({ type: "addr", coord, deletedAt });
}

/**
 * kind:5 の e / a タグのうち、著者が対象と一致するものだけ記録する（他人の kind:5 で消さない）。
 * e タグは対象が store に無いと著者を確かめられないので記録しない。a タグは座標に著者（pubkey）が
 * 入っているので、それが kind:5 の著者と同じときだけ記録する。store.add の前に呼ぶこと
 * （applesauce の DeleteManager が add の中で対象を消してしまうと、e タグの著者を確認できなくなる）。
 */
function recordDeletion(store: EventStore, deletion: NostrEvent): void {
  for (const tag of deletion.tags) {
    if (tag.length < 2) continue;
    if (tag[0] === "e") {
      const target = store.getEvent(tag[1]);
      if (target && target.pubkey === deletion.pubkey) markEventDeletedLocally(tag[1], deletion.created_at);
    } else if (tag[0] === "a") {
      const parts = tag[1].split(":");
      if (parts.length < 3) continue;
      const kind = Number(parts[0]);
      if (!Number.isInteger(kind) || parts[1] !== deletion.pubkey) continue;
      markAddrDeletedLocally(kind, parts[1], parts.slice(2).join(":"), deletion.created_at);
    }
  }
}

/** テスト専用: メモリの削除記録を空にする */
export function resetDeletionMemoryForTest(): void {
  deletedEventIds.clear();
  deletedAddrAt.clear();
}

/**
 * store へイベントを入れる。kind:5 は署名が正しいときだけ入れる。
 * applesauce-core 6.2 の add は kind:5 を署名検証の前に削除として適用するため、
 * pubkey だけ偽った kind:5 でそのユーザーのイベントが消えるのを防ぐ。
 *
 * 記録済みの id / 座標（deletedEventIds / deletedAddrAt。#579）はここで弾き、再取得や復元で
 * 戻らないようにする。受信した kind:5 は、著者が対象と一致する e / a タグだけを記録してから
 * store.add に渡す（store.add 自体の削除適用は applesauce の DeleteManager に任せる）。
 * @returns add の戻り値。署名不正の kind:5 / 記録済みの id・座標は入れずに null
 */
export function addVerifiedTo(store: EventStore, event: NostrEvent, from?: string): NostrEvent | null {
  if (event.kind === 5 && !verifyEvent(event)) return null;
  if (isDeletedLocally(event)) return null;
  if (event.kind === 5) recordDeletion(store, event);
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
