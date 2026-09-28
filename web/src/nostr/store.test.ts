import { EventStore } from "applesauce-core/event-store";
import {
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  getPublicKey,
  type NostrEvent,
  verifyEvent,
} from "nostr-tools/pure";
import { afterEach, expect, it } from "vitest";
import {
  addVerified,
  addVerifiedTo,
  eventStore,
  resetDeletionMemoryForTest,
  verifiedStoreActions,
} from "./store";

afterEach(() => {
  resetDeletionMemoryForTest();
});

const NOW = 1_800_000_000;

/** 自分の kind:3 と、それを e / a タグで消す kind:5 の中身 */
function setup() {
  const key = generateSecretKey();
  const me = getPublicKey(key);
  const contacts = finalizeEvent({ kind: 3, created_at: NOW, tags: [["p", me]], content: "" }, key);
  const deletion = {
    kind: 5,
    created_at: NOW + 1,
    tags: [
      ["e", contacts.id],
      ["a", `3:${me}:`],
    ],
    content: "",
  };
  return { key, me, contacts, deletion };
}

/** pubkey だけ偽った kind:5（id は正しく、署名は無効） */
function forged(pubkey: string, template: Omit<NostrEvent, "id" | "pubkey" | "sig">): NostrEvent {
  const event = { ...template, pubkey };
  return { ...event, id: getEventHash(event), sig: "0".repeat(128) };
}

it("前提: applesauce の add だけだと、署名不正の kind:5 でも自分の kind:3 が消える", () => {
  const { me, contacts, deletion } = setup();
  const store = new EventStore({ verifyEvent });
  store.add(contacts);

  store.add(forged(me, deletion));

  expect(store.getEvent(contacts.id)).toBeUndefined();
});

it("署名不正の kind:5（pubkey = 自分）を入れても自分の kind:3 が残る", () => {
  const { me, contacts, deletion } = setup();
  const store = new EventStore({ verifyEvent });
  addVerifiedTo(store, contacts);

  expect(addVerifiedTo(store, forged(me, deletion))).toBeNull();

  expect(store.getEvent(contacts.id)).toBe(contacts);
  expect(store.getReplaceable(3, me)).toBe(contacts);
});

it("正しい署名の kind:5 は反映される", () => {
  const { key, me, contacts, deletion } = setup();
  const store = new EventStore({ verifyEvent });
  addVerifiedTo(store, contacts);

  expect(addVerifiedTo(store, finalizeEvent(deletion, key))).not.toBeNull();

  expect(store.getEvent(contacts.id)).toBeUndefined();
  expect(store.getReplaceable(3, me)).toBeUndefined();
});

it("アプリのストアとローダ用の口も同じく署名不正の kind:5 を入れない", () => {
  const { key, me, contacts, deletion } = setup();
  addVerified(contacts, "wss://relay.example");

  expect(addVerified(forged(me, deletion), "wss://relay.example")).toBeNull();
  expect(verifiedStoreActions.add(forged(me, deletion))).toBeNull();
  expect(eventStore.getEvent(contacts.id)).toBe(contacts);

  verifiedStoreActions.add(finalizeEvent(deletion, key));
  expect(eventStore.getEvent(contacts.id)).toBeUndefined();
});

// ---- #579: 削除の記憶（reload をまたいでも戻らない） ----

/** 自分の kind:1 と、e タグで消す kind:5 の中身 */
function setupNote(key = generateSecretKey()) {
  const me = getPublicKey(key);
  const note = finalizeEvent({ kind: 1, created_at: NOW, tags: [], content: "本文" }, key);
  const deletion = {
    kind: 5,
    created_at: NOW + 1,
    tags: [
      ["e", note.id],
      ["k", "1"],
    ],
    content: "",
  };
  return { key, me, note, deletion };
}

/** 自分の kind:30023 と、a タグで消す kind:5 の中身 */
function setupAddressable(key = generateSecretKey()) {
  const me = getPublicKey(key);
  const article = finalizeEvent({ kind: 30023, created_at: NOW, tags: [["d", "x"]], content: "本文" }, key);
  const deletion = { kind: 5, created_at: NOW + 1, tags: [["a", `30023:${me}:x`]], content: "" };
  return { key, me, article, deletion };
}

it("発行後（正しい kind:5 で消した後）は、同じ id を addVerified しても入らない", () => {
  const { key, note, deletion } = setupNote();
  const store = new EventStore({ verifyEvent });
  addVerifiedTo(store, note);
  addVerifiedTo(store, finalizeEvent(deletion, key));

  expect(addVerifiedTo(store, note)).toBeNull();
});

it("再読み込み相当（新しい EventStore）でも、消した id は入らない", () => {
  const { key, note, deletion } = setupNote();
  const store1 = new EventStore({ verifyEvent });
  addVerifiedTo(store1, note);
  addVerifiedTo(store1, finalizeEvent(deletion, key));

  // ページ再読み込み相当: DeleteManager を持たない新しい EventStore
  const store2 = new EventStore({ verifyEvent });
  expect(addVerifiedTo(store2, note)).toBeNull();
  expect(store2.getEvent(note.id)).toBeUndefined();
});

it("著者が違う kind:5 では消えない（記録もされない）", () => {
  const { note } = setupNote();
  const store = new EventStore({ verifyEvent });
  addVerifiedTo(store, note);

  const forged = finalizeEvent(
    { kind: 5, created_at: NOW + 1, tags: [["e", note.id]], content: "" },
    generateSecretKey(), // 対象と違う著者（署名は正しい）
  );
  expect(addVerifiedTo(store, forged)).not.toBeNull();
  expect(store.getEvent(note.id)).toBe(note);

  // 記録されていないので、再読み込み相当でも入る
  const store2 = new EventStore({ verifyEvent });
  expect(addVerifiedTo(store2, note)).not.toBeNull();
});

it("対象が手元に無い e タグの kind:5 は記録しない。再読み込み相当のあと本体が来れば入る", () => {
  const { key, note, deletion } = setupNote();
  const store1 = new EventStore({ verifyEvent });

  // note をまだ受け取っていない状態で削除リクエストだけ先に届く
  expect(addVerifiedTo(store1, finalizeEvent(deletion, key))).not.toBeNull();

  // 再読み込み相当（新しい EventStore。同一セッションの DeleteManager には残るが、記録はしていないので
  // 再読み込み後は弾かれない）
  const store2 = new EventStore({ verifyEvent });
  expect(addVerifiedTo(store2, note)).not.toBeNull();
  expect(store2.getEvent(note.id)).toBeDefined();
});

it("座標（addressable。kind:30023）でも同じ: 再読み込み相当でも消した座標は入らない", () => {
  const { key, article, deletion } = setupAddressable();
  const store1 = new EventStore({ verifyEvent });
  addVerifiedTo(store1, article);
  addVerifiedTo(store1, finalizeEvent(deletion, key));
  expect(store1.getEvent(article.id)).toBeUndefined();

  const store2 = new EventStore({ verifyEvent });
  expect(addVerifiedTo(store2, article)).toBeNull();
});

it("座標の pubkey が kind:5 の著者と違えば削除しない", () => {
  const { article } = setupAddressable();
  const store = new EventStore({ verifyEvent });
  addVerifiedTo(store, article);

  const forged = finalizeEvent(
    { kind: 5, created_at: NOW + 1, tags: [["a", `30023:${article.pubkey}:x`]], content: "" },
    generateSecretKey(), // a タグの pubkey と著者が違う
  );
  expect(addVerifiedTo(store, forged)).not.toBeNull();
  expect(store.getEvent(article.id)).toBe(article);

  const store2 = new EventStore({ verifyEvent });
  expect(addVerifiedTo(store2, article)).not.toBeNull();
});

it("削除リクエストより新しい版は、座標が同じでも残る（再公開したものまで消さない）", () => {
  const { key, deletion } = setupAddressable();
  const store = new EventStore({ verifyEvent });
  addVerifiedTo(store, finalizeEvent(deletion, key));

  const republished = finalizeEvent(
    { kind: 30023, created_at: deletion.created_at + 1, tags: [["d", "x"]], content: "書き直し" },
    key,
  );
  expect(addVerifiedTo(store, republished)).not.toBeNull();
  expect(store.getEvent(republished.id)).toBeDefined();
});
