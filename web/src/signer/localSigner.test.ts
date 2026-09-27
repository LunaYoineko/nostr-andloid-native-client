import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import * as nip04 from "nostr-tools/nip04";
import * as nip44 from "nostr-tools/nip44";
import { generateSecretKey, getPublicKey, verifyEvent } from "nostr-tools/pure";
import { beforeEach, expect, it, vi } from "vitest";
import { createLocalSigner } from "./localSigner";
import { createKeyVault, createVaultDatabase, type KeyVault } from "./webKeyVault";

let vault: KeyVault;
let pubkey: string;

beforeEach(async () => {
  const database = createVaultDatabase({
    name: `vault-${crypto.randomUUID()}`,
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  });
  await database.open();
  vault = createKeyVault({ database: async () => database });
  pubkey = await vault.generate();
});

it("署名したイベントは検証でき、渡したテンプレートは書き換えない", async () => {
  const signer = createLocalSigner(pubkey, vault);
  const template = { kind: 1, content: "x", tags: [["t", "a"]], created_at: 1 };

  const signed = await signer.signEvent(template);

  expect(verifyEvent(signed)).toBe(true);
  expect(signed.pubkey).toBe(pubkey);
  expect(signed.tags).toEqual([["t", "a"]]);
  expect(template).not.toHaveProperty("id");
  expect(template).not.toHaveProperty("sig");
  expect(template).not.toHaveProperty("pubkey");
});

it("NIP-44 を相手と往復できる", async () => {
  const signer = createLocalSigner(pubkey, vault);
  const peerSk = generateSecretKey();
  const peer = getPublicKey(peerSk);

  const sent = await signer.nip44?.encrypt(peer, "こんにちは");
  expect(nip44.decrypt(sent ?? "", nip44.getConversationKey(peerSk, pubkey))).toBe("こんにちは");

  const received = nip44.encrypt("やあ", nip44.getConversationKey(peerSk, pubkey));
  expect(await signer.nip44?.decrypt(peer, received)).toBe("やあ");
});

it("NIP-04 を相手と往復できる", async () => {
  const signer = createLocalSigner(pubkey, vault);
  const peerSk = generateSecretKey();
  const peer = getPublicKey(peerSk);

  const sent = await signer.nip04?.encrypt(peer, "hello");
  expect(nip04.decrypt(peerSk, pubkey, sent ?? "")).toBe("hello");

  const received = nip04.encrypt(peerSk, pubkey, "hi");
  expect(await signer.nip04?.decrypt(peer, received)).toBe("hi");
});

it("caps は sign / nip44 / nip04。publicKey は復号しない", async () => {
  const spy = vi.spyOn(vault, "withPrivateKey");
  const signer = createLocalSigner(pubkey, vault);

  expect([...signer.caps].sort()).toEqual(["nip04", "nip44", "sign"]);
  expect(await signer.publicKey()).toBe(pubkey);
  expect(spy).not.toHaveBeenCalled();
});
