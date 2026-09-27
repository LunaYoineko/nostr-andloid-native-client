import { npubEncode } from "nostr-tools/nip19";
import { describe, expect, it } from "vitest";
import { PUBKEY } from "../test/fakeNostr";
import { canGoBackInApp, synthesizeBaseEntry, transientIdOf } from "./history";

function nextPopState(): Promise<void> {
  return new Promise((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
}

it("canGoBackInApp は idx > 0 のときだけ true", () => {
  expect(canGoBackInApp({ idx: 1 })).toBe(true);
  expect(canGoBackInApp({ idx: 0 })).toBe(false);
  expect(canGoBackInApp(null)).toBe(false);
  expect(canGoBackInApp({})).toBe(false);
});

describe("synthesizeBaseEntry", () => {
  it("履歴の先頭の /app/e/… なら下に /app/ を敷き、戻るとデッキ（idx 0）になる", async () => {
    window.history.replaceState(null, "", "/app/e/note1abc");
    const length = window.history.length;

    expect(synthesizeBaseEntry(window)).toBe(true);
    expect(window.location.pathname).toBe("/app/e/note1abc");
    expect(window.history.state.idx).toBe(1);
    expect(window.history.length).toBe(length + 1);

    const popped = nextPopState();
    window.history.back();
    await popped;
    expect(window.location.pathname).toBe("/app/");
    expect(window.history.state.idx).toBe(0);
  });

  it("/app/p/npub1… と /app/t/nostr でも敷く", () => {
    for (const path of [`/app/p/${npubEncode(PUBKEY)}`, "/app/t/nostr"]) {
      window.history.replaceState(null, "", path);
      expect(synthesizeBaseEntry(window)).toBe(true);
      expect(window.location.pathname).toBe(path);
    }
  });

  it("詳細以外のパス・深いパス・既にアプリ内の履歴がある状態では何もしない", () => {
    for (const path of ["/app/", "/app/search", "/app/e/x/y"]) {
      window.history.replaceState(null, "", path);
      const length = window.history.length;
      expect(synthesizeBaseEntry(window)).toBe(false);
      expect(window.location.pathname).toBe(path);
      expect(window.history.state).toBeNull();
      expect(window.history.length).toBe(length);
    }

    window.history.replaceState({ idx: 2 }, "", "/app/e/note1abc");
    const length = window.history.length;
    expect(synthesizeBaseEntry(window)).toBe(false);
    expect(window.history.state).toEqual({ idx: 2 });
    expect(window.history.length).toBe(length);
  });
});

it("transientIdOf は deckTransient が文字列のときだけ返す", () => {
  expect(transientIdOf({ deckTransient: "x" })).toBe("x");
  expect(transientIdOf(null)).toBeNull();
  expect(transientIdOf({ deckTransient: 1 })).toBeNull();
});
