import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { useSession } from "../../signer/session";
import { installDialogPolyfill } from "../../test/dialog";
import { useToast } from "../../ui/toast";
import { ThemeStoreSection } from "./ThemeStoreSection";
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
  useToast.setState({ queue: [] });
});

it("行を押すと適用し、取り消しバーが出る。「元に戻す」で前の配色へ戻る", async () => {
  const user = userEvent.setup();
  render(<ThemeStoreSection />);

  await user.click(screen.getByRole("button", { name: /Sakura/ }));
  expect(useThemePrefs.getState().mode).toBe("custom");
  expect(useThemePrefs.getState().custom).toEqual(sampleEntry.colors);
  expect(screen.getByText("「Sakura」を適用しました")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "元に戻す" }));
  expect(useThemePrefs.getState().custom).toEqual(DEFAULT_THEME_PREFS.custom);
});

it("検索に一致しなければ「条件に合うテーマがありません」", async () => {
  const user = userEvent.setup();
  render(<ThemeStoreSection />);
  await user.type(screen.getByPlaceholderText("テーマ名・作者名で検索"), "存在しない名前");
  expect(screen.getByText("条件に合うテーマがありません。")).toBeInTheDocument();
});

it("自分のテーマの行だけ削除をリクエストできる（確認してから送信）", async () => {
  useSession.setState({ status: "in", method: "nip07", pubkey: sampleEntry.author });
  const user = userEvent.setup();
  render(<ThemeStoreSection />);

  await user.click(screen.getByRole("button", { name: "削除をリクエスト" }));
  const dialog = screen.getByRole("dialog", { name: "このテーマの削除をリクエストしますか？" });
  await user.click(within(dialog).getByRole("button", { name: "削除をリクエスト" }));

  // EventStore に元イベントが無いテスト環境なので送信できないが、確認 → 送信の導線自体を検証する
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(useToast.getState().queue).toContain("削除リクエストを送信できませんでした。"));
});

it("他人のテーマの行には削除をリクエストが出ない", () => {
  useSession.setState({ status: "in", method: "nip07", pubkey: "b".repeat(64) });
  render(<ThemeStoreSection />);
  expect(screen.queryByRole("button", { name: "削除をリクエスト" })).toBeNull();
});

it("この配色をコピーで共有コードをクリップボードへ書き込む", async () => {
  const user = userEvent.setup();
  render(<ThemeStoreSection />);
  await user.click(screen.getByRole("button", { name: "この配色をコピー" }));
  const code = await navigator.clipboard.readText();
  expect(code.startsWith("nostrism-theme:1:MyTheme:")).toBe(true);
});

it("共有コードの取り込みは適用（取り消しバー付き）。不正な形式はトーストで知らせる", async () => {
  const user = userEvent.setup();
  render(<ThemeStoreSection />);

  const input = screen.getByPlaceholderText("共有コード");
  await user.type(input, "不正なコード");
  await user.click(screen.getByRole("button", { name: "取り込む" }));
  await waitFor(() => expect(useToast.getState().queue).toContain("共有コードの形式が正しくありません。"));

  await user.clear(input);
  await user.type(input, "nostrism-theme:1:Mono:000000,FFFFFF,FF0000:0.3.0");
  await user.click(screen.getByRole("button", { name: "取り込む" }));
  expect(useThemePrefs.getState().custom).toEqual({ bg: "#000000", text: "#FFFFFF", accent: "#FF0000" });
  expect(screen.getByText("「Mono」を適用しました")).toBeInTheDocument();
});
