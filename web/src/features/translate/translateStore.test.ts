import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translateNote } from "./translate";
import { hideTranslation, requestTranslation, useTranslateStore, useTranslation } from "./translateStore";

vi.mock("./translate", () => ({ translateNote: vi.fn() }));

afterEach(() => {
  vi.mocked(translateNote).mockReset();
  useTranslateStore.setState({ entries: {}, pending: new Set() });
});

describe("requestTranslation / hideTranslation", () => {
  it("成功: 表示状態になり、2 回目は訳し直さない", async () => {
    vi.mocked(translateNote).mockResolvedValue("翻訳結果");
    expect(await requestTranslation("id1", "本文")).toBe(true);
    expect(translateNote).toHaveBeenCalledTimes(1);
    expect(useTranslateStore.getState().entries.id1).toEqual({ text: "翻訳結果", visible: true });

    hideTranslation("id1");
    expect(useTranslateStore.getState().entries.id1.visible).toBe(false);

    // 隠した後にもう一度「翻訳」を押しても translateNote は呼ばない（キャッシュを表示するだけ）
    expect(await requestTranslation("id1", "本文")).toBe(true);
    expect(translateNote).toHaveBeenCalledTimes(1);
    expect(useTranslateStore.getState().entries.id1).toEqual({ text: "翻訳結果", visible: true });
  });

  it("失敗（null）は false を返し、表示状態にしない", async () => {
    vi.mocked(translateNote).mockResolvedValue(null);
    expect(await requestTranslation("id1", "本文")).toBe(false);
    expect(useTranslateStore.getState().entries.id1).toBeUndefined();
  });

  it("取得中は pending が立ち、終わると下りる", async () => {
    let resolve: (v: string | null) => void = () => {};
    vi.mocked(translateNote).mockReturnValue(new Promise((r) => (resolve = r)));
    const promise = requestTranslation("id1", "本文");
    expect(useTranslateStore.getState().pending.has("id1")).toBe(true);
    resolve("結果");
    expect(await promise).toBe(true);
    expect(useTranslateStore.getState().pending.has("id1")).toBe(false);
  });

  it("hideTranslation は未取得の id には何もしない", () => {
    hideTranslation("no-such-id");
    expect(useTranslateStore.getState().entries).toEqual({});
  });
});

describe("useTranslation", () => {
  it("未取得は null", () => {
    const { result } = renderHook(() => useTranslation("id1"));
    expect(result.current).toBeNull();
  });
});
