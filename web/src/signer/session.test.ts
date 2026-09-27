import { decode, nsecEncode } from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey, verifyEvent } from "nostr-tools/pure";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeNostr, installTestVault, OTHER_PUBKEY, PUBKEY, resetSession } from "../test/fakeNostr";
import { currentSigner, LoginError, SESSION_FLAG_KEY, SESSION_KEY, useSession } from "./session";
import { VAULT_ROW_ID } from "./webKeyVault";

afterEach(() => {
  vi.useRealTimers();
  resetSession();
  delete (navigator as { storage?: unknown }).storage;
});

function saveSession(pubkey: string, method = "nip07") {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ method, pubkey }));
  localStorage.setItem(SESSION_FLAG_KEY, "1");
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function localStorageValues(): string[] {
  return Array.from(
    { length: localStorage.length },
    (_, i) => localStorage.getItem(localStorage.key(i) ?? "") ?? "",
  );
}

function stubPersist() {
  const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };
  Object.defineProperty(navigator, "storage", { configurable: true, value: storage });
  return storage;
}

describe("login", () => {
  it("拡張の公開鍵で in になり、localStorage の 2 キーを書く", async () => {
    installFakeNostr();
    await useSession.getState().login();

    expect(useSession.getState()).toMatchObject({ status: "in", method: "nip07", pubkey: PUBKEY });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null")).toEqual({
      method: "nip07",
      pubkey: PUBKEY,
    });
    expect(localStorage.getItem(SESSION_FLAG_KEY)).toBe("1");
  });

  it("拡張が拒否したら LoginError(rejected) を投げ、何も保存しない", async () => {
    installFakeNostr({ reject: true });
    await expect(useSession.getState().login()).rejects.toMatchObject({ reason: "rejected" });
    expect(useSession.getState().status).toBe("loading");
    expect(localStorage.length).toBe(0);
  });

  it("拡張が現れなければ待ち時間切れで LoginError(missing) を投げる", async () => {
    vi.useFakeTimers();
    const result = useSession
      .getState()
      .login()
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1500);
    const error = await result;

    expect(error).toBeInstanceOf(LoginError);
    expect(error).toMatchObject({ reason: "missing" });
  });
});

describe("loginWithNsec", () => {
  it("取り込んだ鍵で local の in になり、localStorage には公開鍵だけを書く", async () => {
    const db = await installTestVault();
    const storage = stubPersist();
    const sk = generateSecretKey();
    const nsec = nsecEncode(sk);
    const pubkey = getPublicKey(sk);

    await useSession.getState().loginWithNsec(nsec);

    expect(useSession.getState()).toMatchObject({ status: "in", method: "local", pubkey });
    expect(localStorage.getItem(SESSION_KEY)).toBe(JSON.stringify({ method: "local", pubkey }));
    expect(localStorage.getItem(SESSION_FLAG_KEY)).toBe("1");
    for (const value of localStorageValues()) {
      expect(value).not.toContain(nsec);
      expect(value).not.toContain(hex(sk));
    }
    expect(await db.vault.count()).toBe(1);
    await vi.waitFor(() => expect(storage.persist).toHaveBeenCalledTimes(1));
  });

  it("nsec1 で始まらなければ invalid-format、読めない nsec は invalid-key。何も保存しない", async () => {
    const db = await installTestVault();
    const nsec = nsecEncode(generateSecretKey());
    const broken = nsec.slice(0, -1) + (nsec.at(-1) === "q" ? "p" : "q");

    await expect(useSession.getState().loginWithNsec("abc")).rejects.toMatchObject({
      name: "LoginError",
      reason: "invalid-format",
    });
    await expect(useSession.getState().loginWithNsec(broken)).rejects.toMatchObject({
      reason: "invalid-key",
    });
    expect(localStorage.length).toBe(0);
    expect(await db.vault.count()).toBe(0);
  });

  it("保管先が使えなければ unavailable で、何も保存しない", async () => {
    const error = await useSession
      .getState()
      .loginWithNsec(nsecEncode(generateSecretKey()))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LoginError);
    expect(error).toMatchObject({ reason: "unavailable" });
    expect(localStorage.length).toBe(0);
    expect(useSession.getState().status).toBe("loading");
  });
});

describe("新規生成", () => {
  it("generateNewKey は保管した鍵の nsec を返すだけでログインせず、loginWithNewKey で local の in", async () => {
    const db = await installTestVault();
    useSession.setState({ status: "out" });

    const { pubkey, nsec } = await useSession.getState().generateNewKey();
    const decoded = decode(nsec);
    expect(decoded.type).toBe("nsec");
    expect(getPublicKey(decoded.data as Uint8Array)).toBe(pubkey);
    expect(useSession.getState().status).toBe("out");
    expect(localStorage.length).toBe(0);
    expect(await db.vault.count()).toBe(1);

    await useSession.getState().loginWithNewKey(pubkey);
    expect(useSession.getState()).toMatchObject({ status: "in", method: "local", pubkey });
    expect(localStorage.getItem(SESSION_KEY)).toBe(JSON.stringify({ method: "local", pubkey }));
    for (const value of localStorageValues()) expect(value).not.toContain(nsec);
    expect(await db.vault.count()).toBe(1);
  });

  it("保管した鍵と違う公開鍵では loginWithNewKey は unavailable", async () => {
    await installTestVault();
    useSession.setState({ status: "out" });
    await useSession.getState().generateNewKey();

    await expect(useSession.getState().loginWithNewKey(OTHER_PUBKEY)).rejects.toMatchObject({
      reason: "unavailable",
    });
    expect(useSession.getState().status).toBe("out");
    expect(localStorage.length).toBe(0);
  });

  it("保管先が使えなければ generateNewKey は unavailable", async () => {
    await expect(useSession.getState().generateNewKey()).rejects.toMatchObject({ reason: "unavailable" });
  });
});

describe("restore", () => {
  it("local の保存と保管庫の鍵が一致すれば in", async () => {
    await installTestVault();
    await useSession.getState().loginWithNsec(nsecEncode(generateSecretKey()));
    const { pubkey } = useSession.getState();
    useSession.setState({ status: "loading", method: null, pubkey: null });

    await useSession.getState().restore();

    expect(useSession.getState()).toMatchObject({ status: "in", method: "local", pubkey });
  });

  it("local の保存があっても保管庫に鍵が無ければ out にして保存を消す", async () => {
    await installTestVault();
    saveSession(PUBKEY, "local");

    await useSession.getState().restore();

    expect(useSession.getState().status).toBe("out");
    expect(localStorage.length).toBe(0);
  });

  it("local の保存と保管庫の鍵が違えば out にして、保存と鍵を消す", async () => {
    const db = await installTestVault();
    await useSession.getState().loginWithNsec(nsecEncode(generateSecretKey()));
    saveSession(PUBKEY, "local");

    await useSession.getState().restore();

    expect(useSession.getState().status).toBe("out");
    expect(localStorage.length).toBe(0);
    await vi.waitFor(async () => expect(await db.vault.count()).toBe(0));
  });

  it("pubkey が hex でない保存は捨てて out", async () => {
    await installTestVault();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ method: "local", pubkey: "xyz" }));

    await useSession.getState().restore();

    expect(useSession.getState().status).toBe("out");
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("保存した pubkey と拡張の公開鍵が一致すれば in", async () => {
    saveSession(PUBKEY);
    installFakeNostr();
    await useSession.getState().restore();

    expect(useSession.getState()).toMatchObject({ status: "in", method: "nip07", pubkey: PUBKEY });
    expect(localStorage.getItem(SESSION_FLAG_KEY)).toBe("1");
  });

  it("pubkey が一致しなければ out にして保存を消す", async () => {
    saveSession(PUBKEY);
    installFakeNostr({ pubkey: OTHER_PUBKEY });
    await useSession.getState().restore();

    expect(useSession.getState()).toMatchObject({ status: "out", method: null, pubkey: null });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_FLAG_KEY)).toBeNull();
  });

  it("拡張が無ければ待ち時間切れで out にして保存を消す", async () => {
    vi.useFakeTimers();
    saveSession(PUBKEY);
    const done = useSession.getState().restore();
    await vi.advanceTimersByTimeAsync(1500);
    await done;

    expect(useSession.getState().status).toBe("out");
    expect(localStorage.length).toBe(0);
  });

  it("保存が無ければ拡張を呼ばずに out", async () => {
    const { getPublicKey } = installFakeNostr();
    await useSession.getState().restore();

    expect(useSession.getState().status).toBe("out");
    expect(getPublicKey).not.toHaveBeenCalled();
  });
});

describe("logout", () => {
  it("両キーを消して out", async () => {
    installFakeNostr();
    await useSession.getState().login();
    useSession.getState().logout();

    expect(useSession.getState()).toMatchObject({ status: "out", method: null, pubkey: null });
    expect(localStorage.length).toBe(0);
  });

  it("local のログアウトで保管庫の鍵も消す", async () => {
    const db = await installTestVault();
    await useSession.getState().loginWithNsec(nsecEncode(generateSecretKey()));
    useSession.getState().logout();

    expect(useSession.getState().status).toBe("out");
    expect(localStorage.length).toBe(0);
    await vi.waitFor(async () => expect(await db.vault.count()).toBe(0));
  });

  it("NIP-07 でのログインは前のローカル鍵の残りを消す", async () => {
    const db = await installTestVault();
    await useSession.getState().loginWithNsec(nsecEncode(generateSecretKey()));
    installFakeNostr();
    await useSession.getState().login();

    expect(useSession.getState()).toMatchObject({ status: "in", method: "nip07", pubkey: PUBKEY });
    await vi.waitFor(async () => expect(await db.vault.get(VAULT_ROW_ID)).toBeUndefined());
  });
});

describe("currentSigner", () => {
  it("未ログインなら null、NIP-07 でログイン中なら署名できる Signer", async () => {
    expect(currentSigner()).toBeNull();

    installFakeNostr();
    useSession.setState({ status: "in", method: "nip07", pubkey: PUBKEY });
    const signer = currentSigner();

    expect(signer).not.toBeNull();
    expect(signer?.caps.has("sign")).toBe(true);
    await expect(signer?.publicKey()).resolves.toBe(PUBKEY);
  });

  it("local でログイン中なら保管庫の鍵で署名する Signer", async () => {
    await installTestVault();
    await useSession.getState().loginWithNsec(nsecEncode(generateSecretKey()));
    const signer = currentSigner();

    expect([...(signer?.caps ?? [])].sort()).toEqual(["nip04", "nip44", "sign"]);
    const signed = await signer?.signEvent({ kind: 1, content: "x", tags: [], created_at: 1 });
    expect(signed && verifyEvent(signed)).toBe(true);
    expect(signed?.pubkey).toBe(useSession.getState().pubkey);
  });
});
