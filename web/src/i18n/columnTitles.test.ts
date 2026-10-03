import { afterEach, expect, it } from "vitest";
import { columnLabel, templateLabel } from "../lib/columns";
import {
  CANONICAL_SUBTITLE,
  CANONICAL_TITLE,
  columnDisplaySubtitle,
  columnDisplayTitle,
} from "./columnTitles";
import { setLocaleSetting } from "./locale";

afterEach(() => setLocaleSetting("ja"));

it("ja では保存値（正準の日本語）がそのまま表示名になる", () => {
  expect(columnDisplayTitle(CANONICAL_TITLE.following)).toBe("フォロー中");
  expect(columnDisplayTitle(CANONICAL_TITLE.global)).toBe("グローバル");
});

it("en では既定カラム名・テンプレ名が英語になる（保存値は変えない）", () => {
  setLocaleSetting("en");
  expect(columnDisplayTitle(CANONICAL_TITLE.following)).toBe("Following");
  expect(columnDisplayTitle(CANONICAL_TITLE.global)).toBe("Global");
  expect(columnDisplayTitle(CANONICAL_TITLE.notifications)).toBe("Notifications");
  expect(columnDisplayTitle(CANONICAL_TITLE.dm)).toBe("DM");
  expect(columnDisplaySubtitle(CANONICAL_SUBTITLE.myReactions)).not.toBe(CANONICAL_SUBTITLE.myReactions);
  expect(columnLabel({ title: CANONICAL_TITLE.following })).toBe("Following");
  expect(templateLabel("FOLLOWING")).toBe("Following");
  // 保存値そのものは日本語のまま
  expect(CANONICAL_TITLE.following).toBe("フォロー中");
});

it("en でも、正準値に一致しない文字列（ユーザー入力のタイトル）はそのまま", () => {
  setLocaleSetting("en");
  expect(columnDisplayTitle("#nostr")).toBe("#nostr");
  expect(columnDisplayTitle("好きなカラム")).toBe("好きなカラム");
  expect(columnDisplaySubtitle("何かのサブタイトル")).toBe("何かのサブタイトル");
});
