import { afterEach, describe, expect, it, vi } from "vitest";
import { installFakeNostr, OTHER_PUBKEY, PUBKEY, resetSession } from "../test/fakeNostr";
import { LoginError, SESSION_FLAG_KEY, SESSION_KEY, useSession } from "./session";

afterEach(() => {
  vi.useRealTimers();
  resetSession();
});

function saveSession(pubkey: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ method: "nip07", pubkey }));
  localStorage.setItem(SESSION_FLAG_KEY, "1");
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

describe("restore", () => {
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
});
