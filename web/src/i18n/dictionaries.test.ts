import { describe, expect, it } from "vitest";
import jaKansai from "./ja-kansai.json";
import nativeEn from "./native.en.json";
import nativeJa from "./native.ja.json";
import webEn from "./web.en.json";
import webJa from "./web.ja.json";

type Dict = Readonly<Record<string, string>>;

const JA: Dict = { ...nativeJa, ...webJa };
const EN: Dict = { ...nativeEn, ...webEn };

/** `%1$s` / `%2$d` / `%s` / `%%` の並び（順序は言語で変わるので並べ替えて比べる） */
function placeholders(value: string): string {
  return (value.match(/%(?:\d+\$)?[sd%]/g) ?? []).sort().join(" ");
}

describe("辞書の整合（ja / en / ja-kansai）", () => {
  it("en（native + web）は ja と同じキー集合", () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(JA).sort());
    expect(Object.keys(nativeEn).sort()).toEqual(Object.keys(nativeJa).sort());
    expect(Object.keys(webEn).sort()).toEqual(Object.keys(webJa).sort());
  });

  it("en のプレースホルダは ja と個数・種類が同じ", () => {
    const mismatched = Object.keys(JA).filter((k) => placeholders(EN[k] ?? "") !== placeholders(JA[k] ?? ""));
    expect(mismatched).toEqual([]);
  });

  it("ja-kansai に ja に無いキーは無い（孤児なし）", () => {
    const orphans = Object.keys(jaKansai).filter((k) => !(k in JA));
    expect(orphans).toEqual([]);
  });

  it("ja-kansai のプレースホルダは ja と個数・種類が同じ", () => {
    const kansai: Dict = jaKansai;
    const mismatched = Object.keys(kansai).filter(
      (k) => placeholders(kansai[k] ?? "") !== placeholders(JA[k] ?? ""),
    );
    expect(mismatched).toEqual([]);
  });

  it("どの辞書にも空の値は無い", () => {
    for (const dict of [nativeJa, nativeEn, webJa, webEn, jaKansai] as Dict[]) {
      const empty = Object.keys(dict).filter((k) => (dict[k] ?? "").trim() === "");
      expect(empty).toEqual([]);
    }
  });

  it("web 辞書のキーは web_ 始まり", () => {
    expect(Object.keys(webEn).filter((k) => !k.startsWith("web_"))).toEqual([]);
  });
});
