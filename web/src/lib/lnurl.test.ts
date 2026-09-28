import { type NostrEvent, verifyEvent } from "nostr-tools/pure";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRelays } from "../nostr/pool";
import type { Signer } from "../nostr/signer";
import { currentSigner } from "../signer/session";
import { createTestSigner } from "../test/fakeSigner";
import { fetchLnurlPay, lnurlEncode, lud16ToUrl, requestZapInvoice } from "./lnurl";

// 署名者はテスト用の鍵（拡張・保管庫を使わない）
vi.mock("../signer/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../signer/session")>();
  return { ...actual, currentSigner: vi.fn() };
});

const LUD16 = "alice@example.com";
const META_URL = "https://example.com/.well-known/lnurlp/alice";
/** META_URL の LNURL（Python の bech32 参照実装で求めた値） */
const LNURL = "lnurl1dp68gurn8ghj7etcv9khqmr99e3k7mf09emk2mrv944kummhdchkcmn4wfk8qtmpd35kxeg9saevq";
const RECIPIENT = "c".repeat(64);
const NOTE_ID = "d".repeat(64);
const READ_RELAYS = Array.from({ length: 8 }, (_, i) => `wss://r${i}.example.com`);

/** bech32 の文字 → 5 ビット（テスト側で独立に復号する） */
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function bech32Decode(s: string): { hrp: string; bytes: Uint8Array } {
  const sep = s.lastIndexOf("1");
  const words = [...s.slice(sep + 1, -6)].map((c) => CHARSET.indexOf(c));
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const w of words) {
    acc = (acc << 5) | w;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  return { hrp: s.slice(0, sep), bytes: new Uint8Array(bytes) };
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

/** メタ（META_URL）と callback の応答を返す fetch。呼ばれた URL は calls で見る */
function stubLnurl(meta: Record<string, unknown>, callbackBody: unknown = { pr: "lnbc210n1ptest" }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
    jsonResponse(String(input) === META_URL ? meta : callbackBody),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const NOSTR_META = {
  tag: "payRequest",
  callback: "https://example.com/lnurlp/alice/callback",
  minSendable: 1000,
  maxSendable: 10_000_000_000,
  commentAllowed: 255,
  allowsNostr: true,
  nostrPubkey: "e".repeat(64),
};

let signer: Signer;
let signerPubkey: string;

beforeEach(() => {
  const test = createTestSigner();
  signer = test.signer;
  signerPubkey = test.pubkey;
  vi.mocked(currentSigner).mockReturnValue(signer);
  useRelays.setState({ read: READ_RELAYS, write: READ_RELAYS, source: "saved" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(currentSigner).mockReset();
});

describe("lud16ToUrl", () => {
  it("name@domain → https://domain/.well-known/lnurlp/name", () => {
    expect(lud16ToUrl(LUD16)).toBe(META_URL);
    expect(lud16ToUrl(" hello@getalby.com ")).toBe("https://getalby.com/.well-known/lnurlp/hello");
  });

  it("@ が無い・先頭なら null", () => {
    for (const value of ["alice", "@example.com", "", "  "]) expect(lud16ToUrl(value)).toBeNull();
  });
});

describe("lnurlEncode", () => {
  it("固定ベクタ: lnurl1 で始まり、復号すると元の URL", () => {
    const encoded = lnurlEncode(LUD16);
    expect(encoded).toBe(LNURL);
    expect(encoded?.startsWith("lnurl1")).toBe(true);
    const decoded = bech32Decode(LNURL);
    expect(decoded.hrp).toBe("lnurl");
    expect(new TextDecoder().decode(decoded.bytes)).toBe(META_URL);
    expect(lnurlEncode("hello@getalby.com")).toBe(
      "lnurl1dp68gurn8ghj7em9w3skccne9e3k7mf09emk2mrv944kummhdchkcmn4wfk8qtmgv4kxcmc7lthwh",
    );
  });

  it("lud16 が読めなければ null", () => {
    expect(lnurlEncode("alice")).toBeNull();
  });
});

describe("fetchLnurlPay", () => {
  it("payRequest を sats にして返す。取得は Cookie・Referer なし", async () => {
    const fetchMock = stubLnurl(NOSTR_META);
    await expect(fetchLnurlPay(LUD16)).resolves.toEqual({
      callback: NOSTR_META.callback,
      minSats: 1,
      maxSats: 10_000_000,
      commentAllowed: 255,
      allowsNostr: true,
      nostrPubkey: NOSTR_META.nostrPubkey,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(META_URL);
    expect(init).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("minSendable / commentAllowed / allowsNostr が無ければ 1 sat / 0 / false", async () => {
    stubLnurl({ tag: "payRequest", callback: "https://example.com/cb", maxSendable: 5_000_000 });
    await expect(fetchLnurlPay(LUD16)).resolves.toEqual({
      callback: "https://example.com/cb",
      minSats: 1,
      maxSats: 5_000,
      commentAllowed: 0,
      allowsNostr: false,
      nostrPubkey: null,
    });
  });

  it("payRequest でない・callback が無い・取得失敗は null", async () => {
    stubLnurl({ tag: "withdrawRequest", callback: "https://example.com/cb" });
    await expect(fetchLnurlPay(LUD16)).resolves.toBeNull();
    stubLnurl({ tag: "payRequest" });
    await expect(fetchLnurlPay(LUD16)).resolves.toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(fetchLnurlPay(LUD16)).resolves.toBeNull();
  });
});

describe("requestZapInvoice", () => {
  /** callback に渡した URL（2 回目の fetch） */
  function callbackUrl(fetchMock: ReturnType<typeof stubLnurl>): URL {
    expect(fetchMock).toHaveBeenCalledTimes(2);
    return new URL(String(fetchMock.mock.calls[1][0]));
  }

  it("allowsNostr: 署名した kind:9734 を nostr= に、lnurl= を添える（投稿への Zap は e / k 付き）", async () => {
    const fetchMock = stubLnurl(NOSTR_META);
    const pr = await requestZapInvoice({
      recipient: RECIPIENT,
      lud16: LUD16,
      amountSats: 21,
      comment: "ありがとう",
      eventId: NOTE_ID,
      targetKind: 1,
    });
    expect(pr).toBe("lnbc210n1ptest");

    const url = callbackUrl(fetchMock);
    expect(`${url.origin}${url.pathname}`).toBe(NOSTR_META.callback);
    expect(url.searchParams.get("amount")).toBe("21000");
    expect(url.searchParams.get("lnurl")).toBe(LNURL);
    expect(url.searchParams.has("comment")).toBe(false);

    const zapRequest = JSON.parse(url.searchParams.get("nostr") ?? "") as NostrEvent;
    expect(zapRequest.kind).toBe(9734);
    expect(zapRequest.content).toBe("ありがとう");
    expect(zapRequest.pubkey).toBe(signerPubkey);
    expect(verifyEvent(zapRequest)).toBe(true);
    const relays = zapRequest.tags.find((t) => t[0] === "relays") ?? [];
    expect(relays.slice(1)).toEqual(READ_RELAYS.slice(0, 6));
    expect(zapRequest.tags).toEqual([
      ["relays", ...READ_RELAYS.slice(0, 6)],
      ["amount", "21000"],
      ["lnurl", LNURL],
      ["p", RECIPIENT],
      ["e", NOTE_ID],
      ["k", "1"],
    ]);
  });

  it("プロフィール Zap は e / k なし。読むリレーが 6 件未満ならそのまま", async () => {
    useRelays.setState({ read: READ_RELAYS.slice(0, 2), write: READ_RELAYS, source: "saved" });
    const fetchMock = stubLnurl(NOSTR_META);
    await requestZapInvoice({ recipient: RECIPIENT, lud16: LUD16, amountSats: 100, comment: "" });
    const zapRequest = JSON.parse(callbackUrl(fetchMock).searchParams.get("nostr") ?? "") as NostrEvent;
    expect(zapRequest.tags).toEqual([
      ["relays", ...READ_RELAYS.slice(0, 2)],
      ["amount", "100000"],
      ["lnurl", LNURL],
      ["p", RECIPIENT],
    ]);
  });

  it("allowsNostr でない: コメントを commentAllowed 文字で切って comment= に（nostr= なし）", async () => {
    const fetchMock = stubLnurl({
      tag: "payRequest",
      callback: "https://example.com/cb?user=alice",
      commentAllowed: 5,
    });
    await requestZapInvoice({
      recipient: RECIPIENT,
      lud16: LUD16,
      amountSats: 21,
      comment: "⚡😀あいうえお",
    });
    const url = callbackUrl(fetchMock);
    // callback に ? があれば & で繋ぐ
    expect(url.searchParams.get("user")).toBe("alice");
    expect(url.searchParams.get("amount")).toBe("21000");
    expect(url.searchParams.get("comment")).toBe("⚡😀あいう");
    expect(url.searchParams.has("nostr")).toBe(false);
    expect(url.searchParams.has("lnurl")).toBe(false);
  });

  it("commentAllowed が 0 ならコメントを送らない", async () => {
    const fetchMock = stubLnurl({ tag: "payRequest", callback: "https://example.com/cb" });
    await requestZapInvoice({ recipient: RECIPIENT, lud16: LUD16, amountSats: 21, comment: "hi" });
    expect(callbackUrl(fetchMock).searchParams.has("comment")).toBe(false);
  });

  it("pr の無い応答（サーバのエラー）は失敗（null）", async () => {
    stubLnurl(NOSTR_META, { status: "ERROR", reason: "Invalid amount" });
    await expect(
      requestZapInvoice({ recipient: RECIPIENT, lud16: LUD16, amountSats: 21, comment: "" }),
    ).resolves.toBeNull();
  });

  it("メタが取れない・署名者がいないときは失敗（null）", async () => {
    stubLnurl({ tag: "withdrawRequest" });
    await expect(
      requestZapInvoice({ recipient: RECIPIENT, lud16: LUD16, amountSats: 21, comment: "" }),
    ).resolves.toBeNull();

    vi.mocked(currentSigner).mockReturnValue(null);
    const fetchMock = stubLnurl(NOSTR_META);
    await expect(
      requestZapInvoice({ recipient: RECIPIENT, lud16: LUD16, amountSats: 21, comment: "" }),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
