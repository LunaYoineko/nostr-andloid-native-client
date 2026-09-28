import { type Filter, matchFilters } from "applesauce-core/helpers/filter";
import * as nip04 from "nostr-tools/nip04";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NwcClient, NwcError, type NwcRelayLike, parseNwcUri, setNwcRelayFactoryForTest } from "./nwc";

/**
 * NwcClient が使うリレーの偽物。publish された kind:23194 をそのまま購読者へ配る「共有バス」で、
 * テストの「フェイクウォレット」も同じインスタンスを使って応答する（実リレーには繋がない）。
 */
class FakeRelay implements NwcRelayLike {
  private readonly listeners = new Set<(e: NostrEvent) => void>();
  readonly published: NostrEvent[] = [];
  closed = false;
  challenge$ = { subscribe: () => ({ unsubscribe() {} }) };

  subscription(filters: Filter[]) {
    return {
      subscribe: (fn: (v: NostrEvent | "EOSE") => void) => {
        const listener = (e: NostrEvent) => {
          if (matchFilters(filters, e)) fn(e);
        };
        this.listeners.add(listener);
        return { unsubscribe: () => this.listeners.delete(listener) };
      },
    };
  }

  async publish(event: NostrEvent) {
    this.published.push(event);
    for (const listener of [...this.listeners]) listener(event);
    return { ok: true };
  }

  async authenticate() {
    return { ok: true };
  }

  close() {
    this.closed = true;
  }

  /** テストの「フェイクウォレット」からイベントを配る（publish と同じ経路） */
  emit(event: NostrEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

const RELAY_URL = "wss://relay.example/";

afterEach(() => {
  vi.useRealTimers();
});

describe("parseNwcUri", () => {
  it("relay・secret（小文字化）・lud16 を読む", () => {
    const pubkey = "a".repeat(64);
    const secret = "B".repeat(64);
    const uri = `nostr+walletconnect://${pubkey}?relay=wss%3A%2F%2Frelay.example.com&secret=${secret}&lud16=test%40example.com`;

    expect(parseNwcUri(uri)).toEqual({
      walletPubkey: pubkey,
      relayUrl: "wss://relay.example.com",
      secretHex: secret.toLowerCase(),
      lud16: "test@example.com",
    });
  });

  it("lud16 が無ければ null", () => {
    const uri = `nostr+walletconnect://${"a".repeat(64)}?relay=wss://relay.example.com&secret=${"b".repeat(64)}`;
    expect(parseNwcUri(uri)?.lud16).toBeNull();
  });

  it("nostrwalletconnect:// も許容する", () => {
    const uri = `nostrwalletconnect://${"a".repeat(64)}?relay=wss://relay.example.com&secret=${"b".repeat(64)}`;
    expect(parseNwcUri(uri)?.relayUrl).toBe("wss://relay.example.com");
  });

  it.each([
    ["pubkey が hex でない", `nostr+walletconnect://nothex?relay=wss://r&secret=${"0".repeat(64)}`],
    ["relay が無い", `nostr+walletconnect://${"a".repeat(64)}`],
    ["secret が無い", `nostr+walletconnect://${"a".repeat(64)}?relay=wss://r`],
    ["secret が hex でない", `nostr+walletconnect://${"a".repeat(64)}?relay=wss://r&secret=xyz`],
    ["nostr+walletconnect:// で始まらない", "https://example.com"],
  ])("%s → null", (_name, uri) => {
    expect(parseNwcUri(uri)).toBeNull();
  });
});

/** フェイクウォレット: kind:23194 を復号して {method,params} を読み、応答を組み立てて返す */
function fakeWallet(
  walletSecret: Uint8Array,
  relay: FakeRelay,
  handle: (
    method: string,
    params: unknown,
  ) => { result?: unknown; error?: { code: string; message: string } },
) {
  const walletPubkey = getPublicKey(walletSecret);
  relay.subscription([{ kinds: [23194], "#p": [walletPubkey] }]).subscribe((msg) => {
    if (msg === "EOSE") return;
    const req = JSON.parse(nip04.decrypt(walletSecret, msg.pubkey, msg.content)) as {
      method: string;
      params: unknown;
    };
    const res = JSON.stringify(handle(req.method, req.params));
    const content = nip04.encrypt(walletSecret, msg.pubkey, res);
    const reply = finalizeEvent(
      {
        kind: 23195,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["p", msg.pubkey],
          ["e", msg.id],
        ],
        content,
      },
      walletSecret,
    );
    void relay.publish(reply);
  });
  return walletPubkey;
}

describe("NwcClient", () => {
  it("pay_invoice を往復できる（23194 を NIP-04 で暗号化して投げ、23195 を e タグで待ち合わせる）", async () => {
    const relay = new FakeRelay();
    setNwcRelayFactoryForTest(() => relay);
    const walletSecret = generateSecretKey();
    const walletPubkey = fakeWallet(walletSecret, relay, (method, params) => {
      if (method === "pay_invoice" && (params as { invoice?: string }).invoice === "lnbc-test-invoice") {
        return { result: { preimage: "cafebabe" } };
      }
      return { error: { code: "NOT_IMPLEMENTED", message: "nope" } };
    });
    const secretHex = "11".repeat(32);
    const client = new NwcClient({ walletPubkey, relayUrl: RELAY_URL, secretHex, lud16: null });

    client.start();
    const preimage = await client.payInvoice("lnbc-test-invoice");

    expect(preimage).toBe("cafebabe");
    // 23194 は NIP-04 暗号（平文の method/invoice を含まない）で、p タグにウォレットの鍵を持つ
    const sent = relay.published.find((e) => e.kind === 23194);
    expect(sent?.tags).toEqual([["p", walletPubkey]]);
    expect(sent?.content).not.toContain("pay_invoice");
    expect(sent?.content).not.toContain("lnbc-test-invoice");

    client.stop();
    expect(relay.closed).toBe(true);
  });

  it('ウォレットのエラー応答は NwcError("wallet-error")', async () => {
    const relay = new FakeRelay();
    setNwcRelayFactoryForTest(() => relay);
    const walletSecret = generateSecretKey();
    const walletPubkey = fakeWallet(walletSecret, relay, () => ({
      error: { code: "NOT_IMPLEMENTED", message: "nope" },
    }));
    const client = new NwcClient({
      walletPubkey,
      relayUrl: RELAY_URL,
      secretHex: "22".repeat(32),
      lud16: null,
    });
    client.start();

    const error = await client.request("get_balance", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NwcError);
    expect(error).toMatchObject({ reason: "wallet-error" });
    expect((error as Error).message).toContain("NOT_IMPLEMENTED");
  });

  it("info(kind:13194) が届けば awaitInfo が対応メソッドを返す", async () => {
    const relay = new FakeRelay();
    setNwcRelayFactoryForTest(() => relay);
    const walletSecret = generateSecretKey();
    const walletPubkey = getPublicKey(walletSecret);
    const client = new NwcClient({
      walletPubkey,
      relayUrl: RELAY_URL,
      secretHex: "33".repeat(32),
      lud16: null,
    });
    client.start();

    const info = finalizeEvent(
      { kind: 13194, created_at: Math.floor(Date.now() / 1000), tags: [], content: "pay_invoice get_info" },
      walletSecret,
    );
    relay.emit(info);

    expect(await client.awaitInfo()).toBe("pay_invoice get_info");
    expect(client.methods).toBe("pay_invoice get_info");
  });

  it("info が届かなければ awaitInfo は timeoutMs で null", async () => {
    vi.useFakeTimers();
    const relay = new FakeRelay();
    setNwcRelayFactoryForTest(() => relay);
    const client = new NwcClient({
      walletPubkey: getPublicKey(generateSecretKey()),
      relayUrl: RELAY_URL,
      secretHex: "44".repeat(32),
      lud16: null,
    });
    client.start();

    const result = client.awaitInfo(1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(await result).toBeNull();
  });

  it('応答が無ければ timeoutMs で NwcError("timeout")', async () => {
    vi.useFakeTimers();
    const relay = new FakeRelay(); // フェイクウォレットを繋がない＝無応答
    setNwcRelayFactoryForTest(() => relay);
    const client = new NwcClient({
      walletPubkey: getPublicKey(generateSecretKey()),
      relayUrl: RELAY_URL,
      secretHex: "55".repeat(32),
      lud16: null,
    });
    client.start();

    const result = client.request("pay_invoice", { invoice: "lnbc1" }, 1_000).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_000);

    const error = await result;
    expect(error).toBeInstanceOf(NwcError);
    expect(error).toMatchObject({ reason: "timeout" });
  });
});
