import { EventStore } from "applesauce-core/event-store";
import {
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  getPublicKey,
  type NostrEvent,
  verifyEvent,
} from "nostr-tools/pure";
import { expect, it } from "vitest";
import { addVerified, addVerifiedTo, eventStore, verifiedStoreActions } from "./store";

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
