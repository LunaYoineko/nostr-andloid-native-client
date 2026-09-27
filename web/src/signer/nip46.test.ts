import { generateSecretKey, getPublicKey, verifyEvent } from "nostr-tools/pure";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeBunker } from "../test/fakeBunker";
import { installTestVault, resetSession } from "../test/fakeNostr";
import { useToast } from "../ui/toast";
import {
  connectBunker,
  disconnectNip46,
  NIP46_PERMISSIONS,
  Nip46Error,
  nip46Signer,
  parseBunkerInput,
  restoreNip46,
  setNip46PoolForTest,
  useNip46Auth,
} from "./nip46";
import { getNip46Store, NIP46_ROW_ID } from "./nip46Store";

const RELAY = "wss://relay.example/";
const SECRET = "s3cret-token";

let bunker: FakeBunker;

beforeEach(() => {
  bunker = new FakeBunker();
  setNip46PoolForTest(bunker);
});

afterEach(() => {
  vi.useRealTimers();
  resetSession();
  useToast.setState({ queue: [] });
});

describe("parseBunkerInput", () => {
  const remote = getPublicKey(generateSecretKey());

  it("remote・wss:// のリレー（正規化・重複なし）・secret を読む。前後の空白は許す", () => {
    const input = `  bunker://${remote}?relay=wss://a.example&relay=wss%3A%2F%2Fa.example%2F&relay=ws://b.example&secret=abc \n`;
    expect(parseBunkerInput(input)).toEqual({ remote, relays: ["wss://a.example/"], secret: "abc" });
  });

  it("secret は無くてもよい", () => {
    expect(parseBunkerInput(`bunker://${remote}?relay=wss://a.example`)).toEqual({
      remote,
      relays: ["wss://a.example/"],
      secret: undefined,
    });
  });

  it.each([
    ["relay が無い", `bunker://${remote}`],
    ["ws:// だけ", `bunker://${remote}?relay=ws://a.example`],
    ["hex でない", "bunker://npub1abc?relay=wss://a.example"],
    ["bunker:// で始まらない", `nostrconnect://${remote}?relay=wss://a.example`],
    ["空", "   "],
  ])("%s → null", (_name, input) => {
    expect(parseBunkerInput(input)).toBeNull();
  });
});

describe("connectBunker", () => {
  it("connect の params は [remote, secret, 権限]。get_public_key のユーザーを返し、保管庫に nip46 行を置く", async () => {
    const db = await installTestVault();

    const { pubkey } = await connectBunker(bunker.uri({ secret: SECRET }));

    expect(pubkey).toBe(bunker.user);
    expect(bunker.methods()).toEqual(["connect", "get_public_key"]);
    expect(bunker.requests[0]?.params).toEqual([bunker.remote, SECRET, NIP46_PERMISSIONS.join(",")]);
    const row = await db.vault.get(NIP46_ROW_ID);
    expect(row).toMatchObject({ id: "nip46", pubkey: bunker.user, remote: bunker.remote, relays: [RELAY] });
    // secret は保存しない
    expect(JSON.stringify(row)).not.toContain(SECRET);
    const saved = await getNip46Store().load();
    expect(getPublicKey(saved?.clientKey ?? new Uint8Array(32))).toBe(bunker.requests[0]?.client);
    expect(nip46Signer()).not.toBeNull();
  });

  it("bunker:// として読めなければ invalid-uri で、何も送らない", async () => {
    await expect(connectBunker("bunker://xyz?relay=wss://a.example")).rejects.toMatchObject({
      name: "Nip46Error",
      reason: "invalid-uri",
    });
    expect(bunker.requests).toHaveLength(0);
    expect(bunker.openSubscriptions).toBe(0);
  });

  it("署名側のエラー応答は rejected。購読と AUTH の監視を閉じ、何も保存しない", async () => {
    const db = await installTestVault();
    bunker.replies.set("connect", { error: "invalid secret" });

    const error = await connectBunker(bunker.uri({ secret: SECRET })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Nip46Error);
    expect(error).toMatchObject({ reason: "rejected" });
    // 署名側の応答の中身はメッセージに入れない
    expect((error as Error).message).toBe("rejected");
    expect(bunker.openSubscriptions).toBe(0);
    expect(bunker.relay(RELAY).challenge$.observed).toBe(false);
    expect(await db.vault.count()).toBe(0);
    expect(nip46Signer()).toBeNull();
  });

  it("無応答なら 180 秒で timeout。購読を閉じる", async () => {
    vi.useFakeTimers();
    bunker.replies.set("connect", "silent");
    const result = connectBunker(bunker.uri()).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(179_999);
    expect(bunker.openSubscriptions).toBe(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(await result).toMatchObject({ name: "Nip46Error", reason: "timeout" });
    expect(bunker.openSubscriptions).toBe(0);
  });

  it("get_public_key が無応答なら 60 秒で timeout", async () => {
    vi.useFakeTimers();
    bunker.replies.set("get_public_key", "silent");
    const result = connectBunker(bunker.uri()).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(await result).toMatchObject({ reason: "timeout" });
    expect(bunker.openSubscriptions).toBe(0);
  });

  it("abort で cancelled。購読を閉じる", async () => {
    bunker.replies.set("connect", "silent");
    const controller = new AbortController();
    const result = connectBunker(bunker.uri(), controller.signal).catch((e: unknown) => e);
    await vi.waitFor(() => expect(bunker.requests).toHaveLength(1));

    controller.abort();

    expect(await result).toMatchObject({ reason: "cancelled" });
    expect(bunker.openSubscriptions).toBe(0);
  });

  it("保管先が使えなければ unavailable。購読を閉じる", async () => {
    await expect(connectBunker(bunker.uri())).rejects.toMatchObject({ reason: "unavailable" });
    expect(bunker.openSubscriptions).toBe(0);
    expect(nip46Signer()).toBeNull();
  });

  it("2 回目の接続は前の接続を閉じる", async () => {
    await installTestVault();
    await connectBunker(bunker.uri());
    expect(bunker.openSubscriptions).toBe(1);

    await connectBunker(bunker.uri());

    expect(bunker.openSubscriptions).toBe(1);
    // 前の接続へ logout は送らない
    expect(bunker.methods()).not.toContain("logout");
  });
});

describe("署名者", () => {
  it("restoreNip46 の後の最初の signEvent で connect を送らない（sign_event だけ）", async () => {
    await installTestVault();
    await getNip46Store().save({
      pubkey: bunker.user,
      remote: bunker.remote,
      relays: [RELAY],
      clientKey: generateSecretKey(),
    });

    expect(await restoreNip46(bunker.user)).toBe(true);
    // 張り直すだけで何も送らない
    expect(bunker.requests).toHaveLength(0);
    expect(bunker.openSubscriptions).toBe(1);

    const signer = nip46Signer();
    expect([...(signer?.caps ?? [])].sort()).toEqual(["nip04", "nip44", "sign"]);
    await expect(signer?.publicKey()).resolves.toBe(bunker.user);
    const signed = await signer?.signEvent({ kind: 1, content: "hello", tags: [], created_at: 1 });

    expect(bunker.methods()).toEqual(["sign_event"]);
    expect(JSON.parse(bunker.requests[0]?.params[0] ?? "{}")).toMatchObject({ pubkey: bunker.user, kind: 1 });
    expect(signed && verifyEvent(signed)).toBe(true);
    expect(signed?.pubkey).toBe(bunker.user);
  });

  it("保管が無い・ユーザーが違えば restoreNip46 は false", async () => {
    await installTestVault();
    expect(await restoreNip46(bunker.user)).toBe(false);

    await getNip46Store().save({
      pubkey: bunker.user,
      remote: bunker.remote,
      relays: [RELAY],
      clientKey: generateSecretKey(),
    });
    expect(await restoreNip46(getPublicKey(generateSecretKey()))).toBe(false);
    expect(nip46Signer()).toBeNull();
  });

  it("戻りの pubkey が違う署名は例外", async () => {
    await installTestVault();
    await connectBunker(bunker.uri());
    const other = generateSecretKey();
    bunker.replies.set("sign_event", (req) => ({ result: bunker.signAs(other, req.params[0] ?? "{}") }));

    await expect(
      nip46Signer()?.signEvent({ kind: 1, content: "x", tags: [], created_at: 1 }),
    ).rejects.toThrow();
  });

  it("署名が 60 秒無応答なら timeout で、トーストは 30 秒に 1 回まで", async () => {
    await installTestVault();
    await connectBunker(bunker.uri());
    bunker.replies.set("sign_event", "silent");
    vi.useFakeTimers();
    const signer = nip46Signer();
    const template = { kind: 1, content: "x", tags: [], created_at: 1 };

    const first = signer?.signEvent(template).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await first).toMatchObject({ reason: "timeout" });
    expect(useToast.getState().queue).toEqual([
      "署名アプリから応答がありません。アプリを開いてからもう一度お試しください",
    ]);

    // 60 秒後の 2 回目は前のトーストから 30 秒以上経っているので出す。すぐ後の 3 回目は出さない
    bunker.replies.set("nip44_encrypt", "silent");
    const second = signer?.signEvent(template).catch((e: unknown) => e);
    const third = signer?.nip44?.encrypt(bunker.remote, "x").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await second).toMatchObject({ reason: "timeout" });
    expect(await third).toMatchObject({ reason: "timeout" });
    expect(useToast.getState().queue).toHaveLength(2);
  });
});

describe("auth_url", () => {
  it("https なら承認待ちの URL を出す（window.open は呼ばない）", async () => {
    await installTestVault();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    bunker.replies.set("connect", {
      authUrl: "https://signer.example/approve?t=1",
      after: { result: "ack" },
    });

    await connectBunker(bunker.uri());

    expect(useNip46Auth.getState().url).toBe("https://signer.example/approve?t=1");
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("https 以外は出さず、その要求は失敗する", async () => {
    await installTestVault();
    bunker.replies.set("connect", { authUrl: "javascript:alert(1)" });

    await expect(connectBunker(bunker.uri())).rejects.toMatchObject({ reason: "rejected" });
    expect(useNip46Auth.getState().url).toBeNull();
  });
});

describe("AUTH", () => {
  it("challenge$ に値が来たらクライアント鍵の署名者で authenticate する（ユーザーの鍵ではない）", async () => {
    await installTestVault();
    await connectBunker(bunker.uri());
    const relay = bunker.relay(RELAY);
    expect(relay.authenticate).not.toHaveBeenCalled();

    relay.challenge$.next("challenge-1");

    await vi.waitFor(() => expect(relay.authenticate).toHaveBeenCalledTimes(1));
    const signer = relay.authenticate.mock.calls[0]?.[0];
    const authPubkey = await signer?.getPublicKey();
    expect(authPubkey).toBe(bunker.requests[0]?.client);
    expect(authPubkey).not.toBe(bunker.user);
  });

  it("authenticate の失敗は無視する", async () => {
    await installTestVault();
    await connectBunker(bunker.uri());
    const relay = bunker.relay(RELAY);
    relay.authenticate.mockRejectedValueOnce(new Error("auth failed"));

    relay.challenge$.next("challenge-1");

    await vi.waitFor(() => expect(relay.authenticate).toHaveBeenCalledTimes(1));
    expect(nip46Signer()).not.toBeNull();
  });
});

describe("disconnectNip46", () => {
  it("署名側へ logout を送り、購読を閉じて nip46 行を消す", async () => {
    const db = await installTestVault();
    await connectBunker(bunker.uri());

    await disconnectNip46();

    expect(bunker.methods()).toEqual(["connect", "get_public_key", "logout"]);
    expect(bunker.openSubscriptions).toBe(0);
    expect(bunker.relay(RELAY).challenge$.observed).toBe(false);
    expect(await db.vault.get(NIP46_ROW_ID)).toBeUndefined();
    expect(nip46Signer()).toBeNull();
  });

  it("署名側が無応答でも 3 秒で終わる", async () => {
    await installTestVault();
    await connectBunker(bunker.uri());
    bunker.replies.set("logout", "silent");
    vi.useFakeTimers();
    let done = false;
    const result = disconnectNip46().then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(2_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await result;

    expect(done).toBe(true);
    expect(bunker.openSubscriptions).toBe(0);
  });

  it("接続が無くても保管した行を消す", async () => {
    const db = await installTestVault();
    await getNip46Store().save({
      pubkey: bunker.user,
      remote: bunker.remote,
      relays: [RELAY],
      clientKey: generateSecretKey(),
    });

    await disconnectNip46();

    expect(await db.vault.get(NIP46_ROW_ID)).toBeUndefined();
    expect(bunker.requests).toHaveLength(0);
  });
});
