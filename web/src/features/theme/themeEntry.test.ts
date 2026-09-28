import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_APP_VERSION,
  decodeThemeCode,
  encodeThemeCode,
  parseThemeEntry,
  THEME_SCHEMA,
  themeDTag,
  themeSlug,
} from "./themeEntry";

const sakuraColors = { bg: "#FDF3F5", text: "#2A1E22", accent: "#C2557A" };

function themeEvent(content: unknown, tags: string[][], key = generateSecretKey()): NostrEvent {
  return finalizeEvent({ kind: 30078, created_at: 1_000, content: JSON.stringify(content), tags }, key);
}

describe("themeSlug（ネイティブ ThemeEntry.slug の移植）", () => {
  it("英数字はそのまま小文字に", () => {
    expect(themeSlug("Sakura")).toBe("sakura");
  });
  it("文字・数字以外の1文字ずつを - に", () => {
    expect(themeSlug("Dark Mode")).toBe("dark-mode");
  });
  it("空・空白だけなら theme", () => {
    expect(themeSlug("  ")).toBe("theme");
  });
  it("前後の - は除く", () => {
    expect(themeSlug("Mono 2")).toBe("mono-2");
  });
});

it("themeDTag: 接頭辞 + slug", () => {
  expect(themeDTag("Sakura")).toBe("nostrism:theme:sakura");
});

describe("共有コード（ネイティブ ThemeEntryTest の移植）", () => {
  it("往復する", () => {
    const code = encodeThemeCode({ name: "Sakura", colors: sakuraColors, minAppVersion: "0.3.0" });
    expect(code).toBe("nostrism-theme:1:Sakura:FDF3F5,2A1E22,C2557A:0.3.0");
    expect(decodeThemeCode(code)).toEqual({
      name: "Sakura",
      colors: sakuraColors,
      minAppVersion: "0.3.0",
      schema: 1,
    });
  });

  it("# 付きの色・省略した版は既定へ", () => {
    const e = decodeThemeCode("nostrism-theme:1:Mono:#000000,#FFFFFF,#FF0000");
    expect(e?.name).toBe("Mono");
    expect(e?.colors).toEqual({ bg: "#000000", text: "#FFFFFF", accent: "#FF0000" });
    expect(e?.minAppVersion).toBe(DEFAULT_MIN_APP_VERSION);
  });

  it("壊れた入力はすべて null", () => {
    expect(decodeThemeCode("")).toBeNull();
    expect(decodeThemeCode("nope:1:X:000000,FFFFFF,FF0000")).toBeNull(); // 別アプリ
    expect(decodeThemeCode("nostrism-theme:1:X:000000,FFFFFF")).toBeNull(); // 色が2つ
    expect(decodeThemeCode("nostrism-theme:1:X:GGGGGG,FFFFFF,FF0000")).toBeNull(); // 不正な hex
    expect(decodeThemeCode("nostrism-theme:1::000000,FFFFFF,FF0000")).toBeNull(); // 名前なし
  });

  it("name の : はサニタイズされる", () => {
    const code = encodeThemeCode({ name: "Dark:Mode", colors: sakuraColors, minAppVersion: "0.3.0" });
    expect(decodeThemeCode(code)?.name).toBe("Dark-Mode");
  });

  it("schema・minAppVersion を省くと既定値になる", () => {
    const code = encodeThemeCode({ name: "X", colors: sakuraColors });
    expect(code).toBe(`nostrism-theme:${THEME_SCHEMA}:X:FDF3F5,2A1E22,C2557A:${DEFAULT_MIN_APP_VERSION}`);
  });
});

describe("parseThemeEntry", () => {
  it("正しい形を解析し author・dTag・eventId を添える", () => {
    const event = themeEvent(
      { app: "nostrism", schema: 1, name: "Sakura", minAppVersion: "0.4.0", colors: sakuraColors },
      [
        ["d", "nostrism:theme:sakura"],
        ["t", "nostrism-theme"],
        ["title", "Sakura"],
      ],
    );
    const entry = parseThemeEntry(event);
    expect(entry).not.toBeNull();
    expect(entry?.name).toBe("Sakura");
    expect(entry?.colors).toEqual(sakuraColors);
    expect(entry?.minAppVersion).toBe("0.4.0");
    expect(entry?.schema).toBe(1);
    expect(entry?.author).toBe(event.pubkey);
    expect(entry?.dTag).toBe("nostrism:theme:sakura");
    expect(entry?.eventId).toBe(event.id);
    expect(entry?.createdAt).toBe(event.created_at);
  });

  it("minAppVersion / schema 省略時は既定値", () => {
    const event = themeEvent({ name: "X", colors: sakuraColors }, [["d", "nostrism:theme:x"]]);
    const entry = parseThemeEntry(event);
    expect(entry?.minAppVersion).toBe(DEFAULT_MIN_APP_VERSION);
    expect(entry?.schema).toBe(THEME_SCHEMA);
  });

  it("app が nostrism 以外なら捨てる（他アプリの 30078）", () => {
    const event = themeEvent({ app: "other-app", name: "X", colors: sakuraColors }, [["d", "x"]]);
    expect(parseThemeEntry(event)).toBeNull();
  });

  it("app が無ければ許す", () => {
    const event = themeEvent({ name: "X", colors: sakuraColors }, [["d", "x"]]);
    expect(parseThemeEntry(event)).not.toBeNull();
  });

  it("d タグが無ければ捨てる", () => {
    const event = themeEvent({ name: "X", colors: sakuraColors }, []);
    expect(parseThemeEntry(event)).toBeNull();
  });

  it("name が無い・空なら捨てる", () => {
    expect(parseThemeEntry(themeEvent({ colors: sakuraColors }, [["d", "x"]]))).toBeNull();
    expect(parseThemeEntry(themeEvent({ name: "  ", colors: sakuraColors }, [["d", "x"]]))).toBeNull();
  });

  it("3色のいずれかが無い・不正なら捨てる", () => {
    expect(parseThemeEntry(themeEvent({ name: "X" }, [["d", "x"]]))).toBeNull();
    expect(
      parseThemeEntry(themeEvent({ name: "X", colors: { bg: "#000000", text: "#FFFFFF" } }, [["d", "x"]])),
    ).toBeNull();
    expect(
      parseThemeEntry(
        themeEvent({ name: "X", colors: { bg: "GGGGGG", text: "#FFFFFF", accent: "#FF0000" } }, [["d", "x"]]),
      ),
    ).toBeNull();
  });

  it("content が JSON として読めなければ捨てる", () => {
    const event = finalizeEvent(
      { kind: 30078, created_at: 1_000, content: "not json", tags: [["d", "x"]] },
      generateSecretKey(),
    );
    expect(parseThemeEntry(event)).toBeNull();
  });
});
