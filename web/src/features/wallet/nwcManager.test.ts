import { type Filter, matchFilters } from "applesauce-core/helpers/filter";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type NwcStore, setNwcStoreForTest } from "../../signer/nwcStore";
import { useSession } from "../../signer/session";
import { installFakeNostr, resetSession } from "../../test/fakeNostr";
import { NwcError, type NwcRelayLike, setNwcRelayFactoryForTest } from "./nwc";
import { connectNwc, disconnectNwc, restoreNwc, useNwc } from "./nwcManager";

/** nwc.test.ts と同じ「共有バス」の偽リレー（実リレーには繋がない） */
class FakeRelay implements NwcRelayLike {
  private readonly listeners = new Set<(e: NostrEvent) => void>();
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
    this.emit(event);
    return { ok: true };
  }

  async authenticate() {
    return { ok: true };
  }

  close() {
    this.closed = true;
  }

  emit(event: NostrEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

/** テスト用の保管（毎回同じ配列/値を返す、実 DB には触らない） */
class MemoryNwcStore implements NwcStore {
  value: string | null = null;
  async load() {
    return this.value;
  }
  async save(uri: string) {
    this.value = uri;
  }
  async clear() {
    this.value = null;
  }
}

function infoEvent(secret: Uint8Array, methods: string): NostrEvent {
  return finalizeEvent(
    { kind: 13194, created_at: Math.floor(Date.now() / 1000), tags: [], content: methods },
    secret,
  );
}

afterEach(() => {
  vi.useRealTimers();
  useNwc.setState({ connection: null });
});

describe("connectNwc", () => {
  it("info に pay_invoice があれば保存して接続状態にする", async () => {
    const relay = new FakeRelay();
    setNwcRelayFactoryForTest(() => relay);
    const store = new MemoryNwcStore();
    setNwcStoreForTest(store);
    const walletSecret = generateSecretKey();
    const walletPubkey = getPublicKey(walletSecret);
    const uri = `nostr+walletconnect://${walletPubkey}?relay=wss://relay.example/&secret=${"11".repeat(32)}&lud16=me%40example.com`;

    // connectNwc は最初の await（awaitInfo）まで同期で購読を張るので、呼び出した直後に info を配れる
    const pending = connectNwc(uri);
    relay.emit(infoEvent(walletSecret, "pay_invoice get_info"));
    const info = await pending;

    expect(info).toEqual({
      walletPubkey,
      relayUrl: "wss://relay.example/",
      lud16: "me@example.com",
      methods: "pay_invoice get_info",
    });
    expect(useNwc.getState().connection).toEqual(info);
    expect(store.value).toBe(uri);
  });

  it('info が届かなければ NwcError("no-info")、保存しない', async () => {
    vi.useFakeTimers();
    const relay = new FakeRelay(); // 応答なし
    setNwcRelayFactoryForTest(() => relay);
    const store = new MemoryNwcStore();
    setNwcStoreForTest(store);
    const uri = `nostr+walletconnect://${getPublicKey(generateSecretKey())}?relay=wss://relay.example/&secret=${"22".repeat(32)}`;

    const pending = connectNwc(uri).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await pending;

    expect(error).toBeInstanceOf(NwcError);
    expect(error).toMatchObject({ reason: "no-info" });
    expect(store.value).toBeNull();
  });

  it('pay_invoice に対応していなければ NwcError("unsupported")、保存しない', async () => {
    const relay = new FakeRelay();
    setNwcRelayFactoryForTest(() => relay);
    const store = new MemoryNwcStore();
    setNwcStoreForTest(store);
    const walletSecret = generateSecretKey();
    const walletPubkey = getPublicKey(walletSecret);
    const uri = `nostr+walletconnect://${walletPubkey}?relay=wss://relay.example/&secret=${"33".repeat(32)}`;

    const pending = connectNwc(uri).catch((e: unknown) => e);
    relay.emit(infoEvent(walletSecret, "get_info"));
    const error = await pending;

    expect(error).toMatchObject({ name: "NwcError", reason: "unsupported" });
    expect(store.value).toBeNull();
  });

  it('接続文字列が読めなければ NwcError("invalid-uri")', async () => {
    await expect(connectNwc("https://example.com")).rejects.toMatchObject({ reason: "invalid-uri" });
  });
});

describe("disconnectNwc", () => {
  it("保存を消し、接続状態を null にする", async () => {
    const relay = new FakeRelay();
    setNwcRelayFactoryForTest(() => relay);
    const store = new MemoryNwcStore();
    setNwcStoreForTest(store);
    const walletSecret = generateSecretKey();
    const walletPubkey = getPublicKey(walletSecret);
    const pending = connectNwc(
      `nostr+walletconnect://${walletPubkey}?relay=wss://relay.example/&secret=${"44".repeat(32)}`,
    );
    relay.emit(infoEvent(walletSecret, "pay_invoice"));
    await pending;

    disconnectNwc();

    await vi.waitFor(() => expect(store.value).toBeNull());
    expect(useNwc.getState().connection).toBeNull();
  });
});

describe("restoreNwc", () => {
  it("保存済みがあれば張り直し、遅れて届いた info で methods を反映する", async () => {
    const relay = new FakeRelay();
    setNwcRelayFactoryForTest(() => relay);
    const walletSecret = generateSecretKey();
    const walletPubkey = getPublicKey(walletSecret);
    const store = new MemoryNwcStore();
    store.value = `nostr+walletconnect://${walletPubkey}?relay=wss://relay.example/&secret=${"55".repeat(32)}`;
    setNwcStoreForTest(store);

    expect(await restoreNwc()).toBe(true);
    expect(useNwc.getState().connection).toMatchObject({ walletPubkey, methods: null });

    relay.emit(infoEvent(walletSecret, "pay_invoice"));
    await vi.waitFor(() => expect(useNwc.getState().connection?.methods).toBe("pay_invoice"));
  });

  it("保存が無ければ false、状態も変えない", async () => {
    setNwcStoreForTest(new MemoryNwcStore());

    expect(await restoreNwc()).toBe(false);
    expect(useNwc.getState().connection).toBeNull();
  });
});

describe("セッションとの連携", () => {
  afterEach(() => resetSession());

  it("[#537] ログアウト（in から抜ける）で接続を切る（共用 PC を想定）", async () => {
    const relay = new FakeRelay();
    setNwcRelayFactoryForTest(() => relay);
    const store = new MemoryNwcStore();
    setNwcStoreForTest(store);
    const walletSecret = generateSecretKey();
    const walletPubkey = getPublicKey(walletSecret);
    const pending = connectNwc(
      `nostr+walletconnect://${walletPubkey}?relay=wss://relay.example/&secret=${"66".repeat(32)}`,
    );
    relay.emit(infoEvent(walletSecret, "pay_invoice"));
    await pending;
    installFakeNostr();
    await useSession.getState().login();

    useSession.getState().logout();

    await vi.waitFor(() => expect(useNwc.getState().connection).toBeNull());
    expect(store.value).toBeNull();
  });
});
