import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { useSession } from "../../signer/session";
import { installDialogPolyfill } from "../../test/dialog";
import { DEFAULT_CUSTOM_COLORS } from "./customPalette";
import { ThemeEditModal } from "./ThemeEditModal";
import type { ThemeEntry } from "./themeEntry";
import { DEFAULT_THEME_PREFS, useThemePrefs, useThemeUndo } from "./themePrefs";

const sampleEntry: ThemeEntry = {
  name: "Sakura",
  colors: { bg: "#FDF3F5", text: "#2A1E22", accent: "#C2557A" },
  minAppVersion: "0.3.0",
  schema: 1,
  author: "a".repeat(64),
  dTag: "nostrism:theme:sakura",
  eventId: "eventid1",
  createdAt: 1_000,
};

// リレーへは繋がず、一覧はこのテスト用の1件で固定する（読み込み中も終えておく）
vi.mock("./themeStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./themeStore")>()),
  useThemeStoreEntries: () => ({ loading: false, entries: [sampleEntry] }),
}));

beforeAll(() => {
  installDialogPolyfill();
});

afterEach(() => {
  useThemePrefs.setState(DEFAULT_THEME_PREFS);
  useThemeUndo.setState(null);
  useSession.setState({ status: "out", method: null, pubkey: null });
});

it("開いた直後は現在の配色をプレビューし、「適用」は無効（下書きが現在と同じ）", () => {
  render(<ThemeEditModal initialTab="customize" onDismiss={vi.fn()} />);
  expect(screen.getByRole("button", { name: "適用" })).toBeDisabled();
  expect(screen.getByText("プレビュー — 「適用」を押すまで全体には反映されません。")).toBeInTheDocument();
});

it("カスタマイズ: プリセットを押しても適用前は本体（useThemePrefs）を変えない。「適用」で反映する", async () => {
  const user = userEvent.setup();
  render(<ThemeEditModal initialTab="customize" onDismiss={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "Sakura" }));
  // プレビューだけ。まだ本体には反映しない
  expect(useThemePrefs.getState().custom).toEqual(DEFAULT_CUSTOM_COLORS);
  expect(useThemePrefs.getState().mode).toBe(DEFAULT_THEME_PREFS.mode);

  const apply = screen.getByRole("button", { name: "適用" });
  expect(apply).toBeEnabled();
  await user.click(apply);

  expect(useThemePrefs.getState().mode).toBe("custom");
  expect(useThemePrefs.getState().custom).toEqual({ bg: "#FDF3F5", text: "#2A1E22", accent: "#C2557A" });
  expect(screen.getByText("「Sakura」を適用しました")).toBeInTheDocument();
  // 反映後は下書きが現在に追従し、「適用」はまた無効になる
  expect(screen.getByRole("button", { name: "適用" })).toBeDisabled();
});

it("カスタマイズ: hex 入力・既定に戻すも下書きのみ。「適用」まで反映しない", async () => {
  const user = userEvent.setup();
  render(<ThemeEditModal initialTab="customize" onDismiss={vi.fn()} />);

  const bgInput = screen.getByLabelText("背景");
  await user.clear(bgInput);
  await user.type(bgInput, "#00FF00");
  expect(useThemePrefs.getState().custom.bg).toBe(DEFAULT_CUSTOM_COLORS.bg);
  expect(screen.getByRole("button", { name: "適用" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "既定に戻す" }));
  expect(screen.getByRole("button", { name: "適用" })).toBeDisabled();
  expect(useThemePrefs.getState().custom).toEqual(DEFAULT_CUSTOM_COLORS);
});

it("ストア: 行タップでは適用されずプレビューだけ。「適用」で反映される", async () => {
  const user = userEvent.setup();
  render(<ThemeEditModal initialTab="store" onDismiss={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: /Sakura/ }));
  // プレビュー中バッジは出るが、本体はまだ変わらない
  expect(within(screen.getByRole("dialog")).getByText("プレビュー中")).toBeInTheDocument();
  expect(useThemePrefs.getState().custom).toEqual(DEFAULT_CUSTOM_COLORS);
  expect(useThemeUndo.getState()).toBeNull();

  await user.click(screen.getByRole("button", { name: "適用" }));
  expect(useThemePrefs.getState().custom).toEqual(sampleEntry.colors);
  expect(useThemePrefs.getState().mode).toBe("custom");
  expect(screen.getByText("「Sakura」を適用しました")).toBeInTheDocument();
  expect(within(screen.getByRole("dialog")).getByText("適用中")).toBeInTheDocument();
});

it("ストア: すでに適用中のテーマは「適用中」を出し、「プレビュー中」は出さない", () => {
  act(() => useThemePrefs.setState({ mode: "custom", custom: sampleEntry.colors }));
  render(<ThemeEditModal initialTab="store" onDismiss={vi.fn()} />);
  expect(screen.getByText("適用中")).toBeInTheDocument();
  expect(screen.queryByText("プレビュー中")).toBeNull();
});

it("タブを切り替えても下書きは保たれる（ストアで選んでからカスタマイズへ）", async () => {
  const user = userEvent.setup();
  render(<ThemeEditModal initialTab="store" onDismiss={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /Sakura/ }));

  await user.click(screen.getByRole("button", { name: "カスタマイズ" }));
  expect(screen.getByLabelText("背景")).toHaveValue("#FDF3F5");
  expect(screen.getByRole("button", { name: "適用" })).toBeEnabled();
});

it("共有コードのコピーは下書きを書き出す（適用前でも）", async () => {
  const user = userEvent.setup();
  render(<ThemeEditModal initialTab="store" onDismiss={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /Sakura/ }));

  await user.click(screen.getByRole("button", { name: "この配色をコピー" }));
  const code = await navigator.clipboard.readText();
  expect(code).toContain("FDF3F5");
});

it("適用すると取り消しバーが出る。「元に戻す」で前の配色へ戻る", async () => {
  const user = userEvent.setup();
  render(<ThemeEditModal initialTab="customize" onDismiss={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Sakura" }));
  await user.click(screen.getByRole("button", { name: "適用" }));
  expect(useThemePrefs.getState().custom).toEqual({ bg: "#FDF3F5", text: "#2A1E22", accent: "#C2557A" });

  await user.click(screen.getByRole("button", { name: "元に戻す" }));
  expect(useThemePrefs.getState().custom).toEqual(DEFAULT_CUSTOM_COLORS);
});
