import { afterEach, expect, it } from "vitest";
import { formatArgs, t } from "./index";
import { setLocaleSetting, useLocale } from "./locale";

afterEach(() => setLocaleSetting("ja"));

it("ja の辞書の値を返す（テストは ja 固定）", () => {
  expect(t("nyan_mode_title")).toBe("にゃにゃにゃウイルス");
});

it("en に切り替えると en の値を返し、戻すと ja に戻る", () => {
  setLocaleSetting("en");
  expect(useLocale.getState().resolved).toBe("en");
  expect(t("nyan_mode_title")).toBe("Nyan-nyan-nya virus");
  expect(t("web_display_datasaver_title")).toBe("Data saver");
  setLocaleSetting("ja");
  expect(t("web_display_datasaver_title")).toBe("データセーバー");
});

it("%1$s / %2$d / %% を置換する", () => {
  expect(formatArgs("%2$s に %1$d 件 (100%%)", [3, "A"])).toBe("A に 3 件 (100%)");
  expect(formatArgs("%s と %s", ["a", "b"])).toBe("a と b");
});

it("引数が足りない指定と単独の % はそのまま残す", () => {
  expect(formatArgs("%1$s と %2$s", ["a"])).toBe("a と %2$s");
  expect(formatArgs("品質 %1$s%", [85])).toBe("品質 85%");
});

it("未知キーはテストでは throw する", () => {
  expect(() => t("no_such_key")).toThrow("no_such_key");
});
