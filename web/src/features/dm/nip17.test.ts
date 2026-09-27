import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Signer } from "../../nostr/signer";
import { createCipherSigner } from "../../test/cipherSigner";
import { DM_TIME, giftWrap, makeRumor, makeSeal, makeWrap } from "../../test/giftWrap";
import { DmDecryptError, dmFromRumor, unwrapGiftWrap } from "./nip17";

const aliceKey = generateSecretKey();
const ALICE = getPublicKey(aliceKey);
const bobKey = generateSecretKey();
const BOB = getPublicKey(bobKey);

let signer: Signer;
let me: string;
let myKey: Uint8Array;

beforeEach(() => {
  ({ signer, pubkey: me, secretKey: myKey } = createCipherSigner());
});

const asNsec = { decryptErrorIsInvalid: true };
const asExtension = { decryptErrorIsInvalid: false };

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DmDecryptError);
  return (error as DmDecryptError).reason;
}

describe("正しい gift wrap", () => {
  it("相手から自分宛て: peer = 相手", async () => {
    const rumor = makeRumor(aliceKey, { content: "hi", tags: [["p", me]] });
    const unwrapped = await unwrapGiftWrap(signer, giftWrap(rumor, aliceKey, me), asExtension);

    expect(unwrapped).toEqual(rumor);
    expect(dmFromRumor(unwrapped, me)).toEqual({
      id: rumor.id,
      peer: ALICE,
      sender: ALICE,
      content: "hi",
      tags: [["p", me]],
      createdAt: DM_TIME,
    });
  });

  it("自分から相手宛て（自分宛ての控え）: peer = 相手", async () => {
    const rumor = makeRumor(myKey, { content: "yo", tags: [["p", ALICE]] });
    const unwrapped = await unwrapGiftWrap(signer, giftWrap(rumor, myKey, me), asExtension);

    expect(dmFromRumor(unwrapped, me)).toMatchObject({ peer: ALICE, sender: me, content: "yo" });
  });

  it("自分宛てのメモ: peer = 自分", async () => {
    const rumor = makeRumor(myKey, { content: "memo", tags: [["p", me]] });
    const unwrapped = await unwrapGiftWrap(signer, giftWrap(rumor, myKey, me), asExtension);

    expect(dmFromRumor(unwrapped, me)).toMatchObject({ peer: me, sender: me });
  });

  it("rumor に id が無ければ計算した値を使う", async () => {
    const { id, ...withoutId } = makeRumor(aliceKey, { content: "no id", tags: [["p", me]] });
    const unwrapped = await unwrapGiftWrap(signer, giftWrap(withoutId, aliceKey, me), asExtension);
    expect(unwrapped.id).toBe(id);
  });
});

describe("壊れた gift wrap は invalid", () => {
  it("seal の署名が不正", async () => {
    const rumor = makeRumor(aliceKey, { content: "x", tags: [["p", me]] });
    const seal = makeSeal(JSON.stringify(rumor), aliceKey, me);
    const forged = { ...seal, sig: seal.sig.replace(/^./, (c) => (c === "0" ? "1" : "0")) };
    expect(await reasonOf(unwrapGiftWrap(signer, makeWrap(JSON.stringify(forged), me), asExtension))).toBe(
      "invalid",
    );
  });

  it("seal が kind:13 でない", async () => {
    const notSeal = finalizeEvent({ kind: 1, created_at: DM_TIME, tags: [], content: "x" }, aliceKey);
    expect(await reasonOf(unwrapGiftWrap(signer, makeWrap(JSON.stringify(notSeal), me), asExtension))).toBe(
      "invalid",
    );
  });

  it("rumor.pubkey が seal.pubkey と違う（なりすまし）", async () => {
    const rumor = makeRumor(aliceKey, { content: "x", tags: [["p", me]] });
    expect(await reasonOf(unwrapGiftWrap(signer, giftWrap(rumor, bobKey, me), asExtension))).toBe("invalid");
  });

  it("rumor の id が中身と一致しない", async () => {
    const rumor = { ...makeRumor(aliceKey, { content: "x", tags: [["p", me]] }), content: "changed" };
    expect(await reasonOf(unwrapGiftWrap(signer, giftWrap(rumor, aliceKey, me), asExtension))).toBe(
      "invalid",
    );
  });

  it("rumor が kind:15（ファイル）", async () => {
    const rumor = makeRumor(aliceKey, { content: "x", tags: [["p", me]], kind: 15 });
    expect(await reasonOf(unwrapGiftWrap(signer, giftWrap(rumor, aliceKey, me), asExtension))).toBe(
      "invalid",
    );
  });

  it.each([
    ["tags が文字列配列の配列でない", { tags: [["p", 1]] }],
    ["content が文字列でない", { content: 1 }],
    ["created_at が整数でない", { created_at: 1.5 }],
  ])("%s", async (_label, patch) => {
    const { id: _id, ...rumor } = makeRumor(aliceKey, { content: "x", tags: [["p", me]] });
    const broken = { ...rumor, ...patch };
    expect(await reasonOf(unwrapGiftWrap(signer, giftWrap(broken, aliceKey, me), asExtension))).toBe(
      "invalid",
    );
  });

  it("JSON として読めない（seal・rumor）", async () => {
    expect(await reasonOf(unwrapGiftWrap(signer, makeWrap("{not json", me), asExtension))).toBe("invalid");
    const seal = makeSeal("{not json", aliceKey, me);
    expect(await reasonOf(unwrapGiftWrap(signer, makeWrap(JSON.stringify(seal), me), asExtension))).toBe(
      "invalid",
    );
  });

  it("kind:1059 でない・署名者が NIP-44 を使えない", async () => {
    const rumor = makeRumor(aliceKey, { content: "x", tags: [["p", me]] });
    const wrap = giftWrap(rumor, aliceKey, me);
    expect(await reasonOf(unwrapGiftWrap(signer, { ...wrap, kind: 1058 }, asExtension))).toBe("invalid");
    const noNip44 = createCipherSigner({ nip44: false }).signer;
    expect(await reasonOf(unwrapGiftWrap(noNip44, wrap, asExtension))).toBe("invalid");
  });
});

describe("復号の例外", () => {
  it("decryptErrorIsInvalid: false なら signer、true なら invalid", async () => {
    const rumor = makeRumor(aliceKey, { content: "x", tags: [["p", me]] });
    const wrap = giftWrap(rumor, aliceKey, me);
    const rejecting = createCipherSigner().signer;
    rejecting.nip44 = { encrypt: vi.fn(), decrypt: vi.fn(async () => Promise.reject(new Error("rejected"))) };

    expect(await reasonOf(unwrapGiftWrap(rejecting, wrap, asExtension))).toBe("signer");
    expect(await reasonOf(unwrapGiftWrap(rejecting, wrap, asNsec))).toBe("invalid");
  });

  it("エラーのメッセージは理由だけ（中身を含めない）", async () => {
    const rumor = {
      ...makeRumor(aliceKey, { content: "secret text", tags: [["p", me]] }),
      id: "0".repeat(64),
    };
    const error = (await unwrapGiftWrap(signer, giftWrap(rumor, aliceKey, me), asExtension).catch(
      (e: unknown) => e,
    )) as Error;
    expect(error.message).toBe("invalid");
    expect(error.cause).toBeUndefined();
  });
});

describe("dmFromRumor", () => {
  it("宛先が 2 人（グループ）・宛先なしは null。p の重複は 1 人に数える", () => {
    const group = makeRumor(aliceKey, {
      content: "x",
      tags: [
        ["p", me],
        ["p", BOB],
      ],
    });
    const none = makeRumor(aliceKey, { content: "x", tags: [] });
    const duplicated = makeRumor(aliceKey, {
      content: "x",
      tags: [
        ["p", me],
        ["p", me],
      ],
    });
    expect(dmFromRumor(group, me)).toBeNull();
    expect(dmFromRumor(none, me)).toBeNull();
    expect(dmFromRumor(duplicated, me)).toMatchObject({ peer: ALICE });
  });

  it("自分が当事者でなければ null", () => {
    const rumor = makeRumor(aliceKey, { content: "x", tags: [["p", BOB]] });
    expect(dmFromRumor(rumor, me)).toBeNull();
  });
});
