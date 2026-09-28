import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSession } from "../signer/session";
import { NYAN_MODE_KEY, nyaize, setNyanMode, useNyanApplies, useNyanMode } from "./nyan";

afterEach(() => {
  localStorage.clear();
  useNyanMode.setState({ mode: "off" });
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

/** 保存値を入れてからモジュールを読み直し、初期値を返す */
async function initialWith(saved: string | null) {
  if (saved !== null) localStorage.setItem(NYAN_MODE_KEY, saved);
  vi.resetModules();
  const fresh = await import("./nyan");
  return fresh.useNyanMode.getState().mode;
}

it("既定はオフ。保存値が self/all ならそれを、壊れた値ならオフを初期値にする", async () => {
  expect(await initialWith(null)).toBe("off");
  expect(await initialWith("self")).toBe("self");
  localStorage.clear();
  expect(await initialWith("all")).toBe("all");
  localStorage.clear();
  expect(await initialWith("unknown")).toBe("off");
});

it("setNyanMode でストアと localStorage が変わる", () => {
  setNyanMode("all");
  expect(useNyanMode.getState().mode).toBe("all");
  expect(localStorage.getItem(NYAN_MODE_KEY)).toBe("all");
});

// ---- nyaize（NyaizeTest.kt の移植） ----

it("日本語の「な」行を置換する（複数出現もすべて）", () => {
  expect(nyaize("こんにちは、みんな")).toBe("こんにちは、みんにゃ");
  expect(nyaize("ナイス")).toBe("ニャイス");
  expect(nyaize("ﾅﾝﾃﾞｽﾄ")).toBe("ﾆｬﾝﾃﾞｽﾄ");
  expect(nyaize("なかなか")).toBe("にゃかにゃか");
});

it("英語の na/NA/Na を置換する。nA のような混在は対象外", () => {
  expect(nyaize("banana")).toBe("banyanya");
  expect(nyaize("NASA")).toBe("NYASA");
  expect(nyaize("Nagoya")).toBe("Nyagoya");
  expect(nyaize("nA")).toBe("nA");
});

it("対象外の文字はそのまま通す", () => {
  expect(nyaize("")).toBe("");
  expect(nyaize("にゃんこ🐱 123 abc")).toBe("にゃんこ🐱 123 abc");
  expect(nyaize("ハッシュ#tagは呼び出し側で除外する")).toBe("ハッシュ#tagは呼び出し側で除外する");
});

it("複数の置換規則が混在する文", () => {
  expect(nyaize("今日はいい天気だなあ。Nach banana NAIL")).toBe(
    "今日はいい天気だにゃあ。Nyach banyanya NYAIL",
  );
});

// ---- useNyanApplies（Nyan.appliesTo の移植） ----

it("オフなら誰の表示にも掛からない", () => {
  useNyanMode.setState({ mode: "off" });
  const { result } = renderHook(() => useNyanApplies("abc"));
  expect(result.current).toBe(false);
});

it("全員なら pubkey が不明な表示にも掛かる", () => {
  useNyanMode.setState({ mode: "all" });
  expect(renderHook(() => useNyanApplies("abc")).result.current).toBe(true);
  expect(renderHook(() => useNyanApplies(undefined)).result.current).toBe(true);
});

it("自分のみなら自分の pubkey の表示だけに掛かる", () => {
  useNyanMode.setState({ mode: "self" });
  useSession.setState({ status: "in", method: "nip07", pubkey: "me-hex" });
  expect(renderHook(() => useNyanApplies("me-hex")).result.current).toBe(true);
  expect(renderHook(() => useNyanApplies("someone-else")).result.current).toBe(false);
  expect(renderHook(() => useNyanApplies(undefined)).result.current).toBe(false);
});
