import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { DEFAULT_EMBED_PREFS, EMBED_PREFS_KEY, useEmbedPrefs } from "../linkcard/embedPrefs";
import { DisplaySection } from "./DisplaySection";

afterEach(() => {
  localStorage.clear();
  useEmbedPrefs.setState(DEFAULT_EMBED_PREFS);
});

it("埋め込み表示の 6 項目は既定ですべて ON", () => {
  render(<DisplaySection />);
  for (const label of [
    "動画（mp4 等）をインライン再生",
    "YouTube のサムネイルを表示",
    "Spotify のカードを表示",
    "その他リンクの OGP カードを表示",
    "OGP カードの画像を読み込む",
    "カードを出したリンクのURLを本文から隠す",
  ]) {
    expect(screen.getByRole("checkbox", { name: label })).toBeChecked();
  }
});

it("トグルを押すと保存され、次の描画にも残る", async () => {
  const user = userEvent.setup();
  const { unmount } = render(<DisplaySection />);

  await user.click(screen.getByRole("checkbox", { name: "YouTube のサムネイルを表示" }));

  expect(useEmbedPrefs.getState().youtube).toBe(false);
  expect(JSON.parse(localStorage.getItem(EMBED_PREFS_KEY) ?? "null")).toEqual({
    ...DEFAULT_EMBED_PREFS,
    youtube: false,
  });
  unmount();

  render(<DisplaySection />);
  expect(screen.getByRole("checkbox", { name: "YouTube のサムネイルを表示" })).not.toBeChecked();
});

it("OGP カードを表示 が OFF の間は OGP カードの画像を読み込む を無効にする", async () => {
  const user = userEvent.setup();
  render(<DisplaySection />);

  const ogpImages = screen.getByRole("checkbox", { name: "OGP カードの画像を読み込む" });
  expect(ogpImages).toBeEnabled();

  await user.click(screen.getByRole("checkbox", { name: "その他リンクの OGP カードを表示" }));

  expect(ogpImages).toBeDisabled();
});
