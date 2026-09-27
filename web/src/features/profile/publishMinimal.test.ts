import type { PublishResponse } from "applesauce-relay/types";
import {
  type EventTemplate,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  type NostrEvent,
} from "nostr-tools/pure";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pool } from "../../nostr/pool";
import type { Signer } from "../../nostr/signer";
import { eventStore } from "../../nostr/store";
import { currentSigner, useSession } from "../../signer/session";
import { PUBLISH_TIMEOUT_MS, PublishError, signAndPublish } from "./publishMinimal";

// リレーには繋がない（publish の結果はテストごとに返す）
vi.mock("../../nostr/pool", () => ({
  relays: ["wss://relay.example"],
  pool: { publish: vi.fn() },
}));

vi.mock("../../signer/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../signer/session")>()),
  currentSigner: vi.fn(),
}));

let meKey: Uint8Array;
let me: string;
let signed: NostrEvent[];

/** key で署名するフェイクの署名者。署名したイベントは signed に控える */
function fakeSigner(key: Uint8Array): Signer {
  return {
    publicKey: async () => getPublicKey(key),
    signEvent: async (template: EventTemplate) => {
      const event = finalizeEvent(template, key);
      signed.push(event);
      return event;
    },
    caps: new Set(["sign"]),
  };
}

function template(): EventTemplate {
  return { kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content: `test ${Math.random()}` };
}

function ok(value: boolean, from = "wss://relay.example/"): PublishResponse {
  return { ok: value, from };
}

beforeEach(() => {
  meKey = generateSecretKey();
  me = getPublicKey(meKey);
  signed = [];
  useSession.setState({ status: "in", method: "nip07", pubkey: me });
  vi.mocked(currentSigner).mockReturnValue(fakeSigner(meKey));
  vi.mocked(pool.publish).mockReset();
});

afterEach(() => {
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

async function failure(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(PublishError);
  return (error as PublishError).reason;
}

it("未ログイン・署名者が無ければ no-signer", async () => {
  useSession.setState({ status: "out", method: null, pubkey: null });
  expect(await failure(signAndPublish(template()))).toBe("no-signer");

  useSession.setState({ status: "in", method: "nip07", pubkey: me });
  vi.mocked(currentSigner).mockReturnValue(null);
  expect(await failure(signAndPublish(template()))).toBe("no-signer");
  expect(vi.mocked(pool.publish)).not.toHaveBeenCalled();
});

it("署名の拒否は sign-failed、別の鍵で署名されたら pubkey-mismatch", async () => {
  vi.mocked(currentSigner).mockReturnValue({
    ...fakeSigner(meKey),
    signEvent: async () => {
      throw new Error("user rejected");
    },
  });
  expect(await failure(signAndPublish(template()))).toBe("sign-failed");

  vi.mocked(currentSigner).mockReturnValue(fakeSigner(generateSecretKey()));
  expect(await failure(signAndPublish(template()))).toBe("pubkey-mismatch");
  expect(vi.mocked(pool.publish)).not.toHaveBeenCalled();
});

it("どのリレーも OK を返さなければ not-accepted で、ストアには入れない", async () => {
  vi.mocked(pool.publish).mockResolvedValue([ok(false), ok(false, "wss://other/")]);
  expect(await failure(signAndPublish(template()))).toBe("not-accepted");
  expect(eventStore.getEvent(signed[0].id)).toBeUndefined();

  vi.mocked(pool.publish).mockRejectedValue(new Error("timeout"));
  expect(await failure(signAndPublish(template()))).toBe("not-accepted");
  expect(eventStore.getEvent(signed[1].id)).toBeUndefined();
});

it("1 つでも OK なら署名済みイベントを返し、ストアに入れる", async () => {
  vi.mocked(pool.publish).mockResolvedValue([ok(false), ok(true, "wss://other/")]);

  const event = await signAndPublish(template());

  expect(event).toBe(signed[0]);
  expect(event.pubkey).toBe(me);
  expect(eventStore.getEvent(event.id)).toBeDefined();
  expect(vi.mocked(pool.publish)).toHaveBeenCalledWith(["wss://relay.example"], event, {
    timeout: PUBLISH_TIMEOUT_MS,
  });
  expect(PUBLISH_TIMEOUT_MS).toBe(10_000);
});
