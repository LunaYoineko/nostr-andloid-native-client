import type { AuthSigner } from "applesauce-relay/types";
import { makeAuthEvent } from "nostr-tools/nip42";
import { finalizeEvent } from "nostr-tools/pure";
import { BehaviorSubject, type Subscription } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentSigner, useSession } from "../signer/session";
import { createTestSigner } from "../test/fakeSigner";
import { ScriptedWebSocket } from "../test/scriptedWebSocket";
import { pool, SINCE_MARGIN_SEC, subscribeTo } from "./pool";
import {
  AUTH_POLICY_KEY,
  type AuthRelay,
  setAuthPolicy,
  shouldAuth,
  useAuthPolicy,
  watchRelayAuth,
} from "./relayAuth";
import type { Signer } from "./signer";
import { addVerified } from "./store";

vi.mock("../signer/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../signer/session")>()),
  currentSigner: vi.fn(),
}));

const OWN = ["wss://own.example/"];
const DM = ["wss://dm.example/"];
const OTHER = "wss://other.example/";

describe("shouldAuth", () => {
  it("off は応答しない", () => {
    expect(shouldAuth(OWN[0], "off", OWN, DM)).toBe(false);
    expect(shouldAuth(DM[0], "off", OWN, DM)).toBe(false);
    expect(shouldAuth(OTHER, "off", OWN, DM)).toBe(false);
  });

  it("always はすべてに応答する", () => {
    expect(shouldAuth(OWN[0], "always", OWN, DM)).toBe(true);
    expect(shouldAuth(DM[0], "always", OWN, DM)).toBe(true);
    expect(shouldAuth(OTHER, "always", OWN, DM)).toBe(true);
  });

  it("dm は自分のリレーと DM リレーだけ（正規化して比べる）", () => {
    expect(shouldAuth("wss://own.example", "dm", OWN, DM)).toBe(true);
    expect(shouldAuth("wss://dm.example:443/", "dm", OWN, DM)).toBe(true);
    expect(shouldAuth(OTHER, "dm", OWN, DM)).toBe(false);
    expect(shouldAuth("not a url", "dm", OWN, DM)).toBe(false);
  });
});

it("ポリシーは nostrism.nip42AuthPolicy に保存する", () => {
  expect(useAuthPolicy.getState().policy).toBe("dm");
  setAuthPolicy("off");
  expect(localStorage.getItem(AUTH_POLICY_KEY)).toBe("off");
  setAuthPolicy("dm");
  expect(localStorage.getItem(AUTH_POLICY_KEY)).toBe("dm");
});

/** チャレンジと接続状態を流せる偽のリレー */
class FakeAuthRelay implements AuthRelay {
  readonly challenge$ = new BehaviorSubject<string | null>(null);
  readonly connected$ = new BehaviorSubject(true);
  readonly authenticate = vi.fn(async (signer: AuthSigner) => {
    const challenge = this.challenge$.value;
    if (!challenge) throw new Error("no challenge");
    await signer.signEvent(makeAuthEvent(this.url, challenge));
    return { ok: true, from: this.url };
  });

  constructor(readonly url: string) {}

  /** 切断して、つなぎ直す */
  reconnect() {
    this.connected$.next(false);
    this.challenge$.next(null);
    this.connected$.next(true);
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AUTH への応答", () => {
  let signer: Signer;
  let signEvent: ReturnType<typeof vi.fn<Signer["signEvent"]>>;
  let pubkey: string;
  let stop: (() => void) | undefined;

  beforeEach(() => {
    const test = createTestSigner();
    pubkey = test.pubkey;
    signEvent = vi.fn(test.signer.signEvent);
    signer = { ...test.signer, signEvent };
    vi.mocked(currentSigner).mockReturnValue(signer);
    useSession.setState({ status: "in", method: "local", pubkey });
    setAuthPolicy("always");
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    useSession.setState({ status: "loading", method: null, pubkey: null });
    vi.mocked(currentSigner).mockReset();
    localStorage.clear();
    useAuthPolicy.setState({ policy: "dm" });
  });

  function watch(...relays: FakeAuthRelay[]) {
    const map = new Map(relays.map((r) => [r.url, r]));
    stop = watchRelayAuth({ relays$: new BehaviorSubject(map) });
  }

  it("kind:22242（relay / challenge タグ）に署名して送り、同じチャレンジには 2 回目を署名しない", async () => {
    const relay = new FakeAuthRelay("wss://a.example/");
    watch(relay);
    relay.challenge$.next("c1");
    await flush();
    expect(relay.authenticate).toHaveBeenCalledTimes(1);
    expect(signEvent).toHaveBeenCalledTimes(1);
    expect(signEvent.mock.calls[0][0]).toMatchObject({
      kind: 22242,
      content: "",
      tags: [
        ["relay", "wss://a.example/"],
        ["challenge", "c1"],
      ],
    });

    // 同じチャレンジが再び届いても、判定し直しても署名しない
    relay.challenge$.next("c1");
    setAuthPolicy("dm");
    setAuthPolicy("always");
    await flush();
    expect(signEvent).toHaveBeenCalledTimes(1);
  });

  it("off では署名者を呼ばない", async () => {
    setAuthPolicy("off");
    const relay = new FakeAuthRelay("wss://b.example/");
    watch(relay);
    relay.challenge$.next("c1");
    await flush();
    expect(currentSigner).not.toHaveBeenCalled();
    expect(signEvent).not.toHaveBeenCalled();
    expect(relay.authenticate).not.toHaveBeenCalled();
  });

  it("切断した後の同じチャレンジには再び応答する", async () => {
    const relay = new FakeAuthRelay("wss://c.example/");
    watch(relay);
    relay.challenge$.next("c1");
    await flush();
    relay.reconnect();
    relay.challenge$.next("c1");
    await flush();
    expect(relay.authenticate).toHaveBeenCalledTimes(2);
    expect(signEvent).toHaveBeenCalledTimes(2);
  });

  it("署名者が無ければ応答せず、ログインしたら応答する。署名に失敗したら同じ接続では送り直さない", async () => {
    vi.mocked(currentSigner).mockReturnValue(null);
    useSession.setState({ status: "out", method: null, pubkey: null });
    const relay = new FakeAuthRelay("wss://d.example/");
    watch(relay);
    relay.challenge$.next("c1");
    await flush();
    expect(relay.authenticate).not.toHaveBeenCalled();

    const failing = vi.fn(async () => {
      throw new Error("rejected");
    });
    vi.mocked(currentSigner).mockReturnValue({ ...signer, signEvent: failing });
    useSession.setState({ status: "in", method: "nip07", pubkey });
    await flush();
    expect(failing).toHaveBeenCalledTimes(1);

    relay.challenge$.next("c1");
    await flush();
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("dm では自分のリレーと自分の kind:10050 のリレーだけに応答する（kind:10050 が届いたら判定し直す）", async () => {
    setAuthPolicy("dm");
    const test = createTestSigner();
    vi.mocked(currentSigner).mockReturnValue({ ...test.signer, signEvent });
    useSession.setState({ status: "in", method: "local", pubkey: test.pubkey });
    const dm = new FakeAuthRelay("wss://my-dm.example/");
    const other = new FakeAuthRelay("wss://someone-else.example/");
    watch(dm, other);
    dm.challenge$.next("c1");
    other.challenge$.next("c2");
    await flush();
    expect(dm.authenticate).not.toHaveBeenCalled();

    addVerified(
      finalizeEvent(
        {
          kind: 10050,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["relay", "wss://my-dm.example"]],
          content: "",
        },
        test.secretKey,
      ),
    );
    await flush();
    expect(dm.authenticate).toHaveBeenCalledTimes(1);
    expect(other.authenticate).not.toHaveBeenCalled();
  });
});

describe("AUTH 成立後の張り直し（applesauce-relay の実物 + 偽の WebSocket）", () => {
  const NOW = 1_700_000_000;
  let subscriptions: Subscription[] = [];
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.stubGlobal("WebSocket", ScriptedWebSocket);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(NOW * 1000);
  });

  afterEach(() => {
    for (const s of subscriptions) s.unsubscribe();
    subscriptions = [];
    stop?.();
    stop = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useSession.setState({ status: "loading", method: null, pubkey: null });
    vi.mocked(currentSigner).mockReset();
    localStorage.clear();
    useAuthPolicy.setState({ policy: "dm" });
  });

  it("再接続では since 差分で張り直し、AUTH が成立したら同じ購読を since 無しで張り直す", async () => {
    const url = "wss://auth-resend.example/";
    const { signer, pubkey, secretKey } = createTestSigner();
    vi.mocked(currentSigner).mockReturnValue(signer);
    useSession.setState({ status: "in", method: "local", pubkey });
    setAuthPolicy("always");
    stop = watchRelayAuth(pool);
    const filters = [{ kinds: [1059], "#p": [pubkey] }];
    subscriptions.push(subscribeTo([url], filters).subscribe());

    const first = ScriptedWebSocket.latest(url);
    if (!first) throw new Error("no socket");
    first.accept();
    const [req] = first.reqs();
    expect(req.filters).toEqual(filters);
    const received = NOW - 100;
    first.push([
      "EVENT",
      req.id,
      finalizeEvent({ kind: 1059, created_at: received, tags: [["p", pubkey]], content: "x" }, secretKey),
    ]);

    // 異常切断 → 再接続（リレーの待ち 1.5 秒・購読の待ち 1 秒）
    first.drop();
    await vi.advanceTimersByTimeAsync(2_000);
    const second = ScriptedWebSocket.latest(url);
    if (!second || second === first) throw new Error("not reconnected");
    second.accept();
    expect(second.reqs()).toEqual([
      { id: req.id, filters: [{ ...filters[0], since: received - SINCE_MARGIN_SEC }] },
    ]);

    // AUTH → OK で、同じ id の REQ を since 無しで送り直す
    second.push(["AUTH", "challenge-1"]);
    await vi.advanceTimersByTimeAsync(0);
    const [auth] = second.auths();
    expect(auth.kind).toBe(22242);
    expect(auth.tags).toEqual([
      ["relay", url],
      ["challenge", "challenge-1"],
    ]);
    second.push(["OK", auth.id, true, ""]);
    await vi.advanceTimersByTimeAsync(0);
    expect(second.reqs()).toEqual([
      { id: req.id, filters: [{ ...filters[0], since: received - SINCE_MARGIN_SEC }] },
      { id: req.id, filters },
    ]);
    expect(pool.relay(url).authenticated).toBe(true);
  });
});
