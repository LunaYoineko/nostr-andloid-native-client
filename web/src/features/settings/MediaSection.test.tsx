import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { COMPRESSION_KEY, resetImageCompression, useImageCompression } from "../compose/imageCompression";
import { MEDIA_SERVER_KEY, setMediaServer, useMediaServer } from "../compose/mediaServer";
import { MediaSection } from "./MediaSection";

afterEach(() => {
  setMediaServer(null);
  resetImageCompression();
  localStorage.clear();
});

it("未選択は既定の先頭（nostr.build）が選択中。候補を押すとそのサーバーだけにする", async () => {
  const user = userEvent.setup();
  render(<MediaSection />);

  expect(screen.getByText(/nostr\.build → nostrcheck\.me の順に試します/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "nostr.build" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "files.sovbit.host" })).toHaveAttribute("aria-pressed", "false");

  await user.click(screen.getByRole("button", { name: "nostpic.com" }));
  expect(useMediaServer.getState().server).toBe("https://nostpic.com");
  expect(localStorage.getItem(MEDIA_SERVER_KEY)).toBe("https://nostpic.com");
  expect(screen.getByRole("button", { name: "nostpic.com" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "nostr.build" })).toHaveAttribute("aria-pressed", "false");

  await user.click(screen.getByRole("button", { name: "既定に戻す" }));
  expect(useMediaServer.getState().server).toBeNull();
  expect(screen.queryByRole("button", { name: "既定に戻す" })).toBeNull();
});

it("URL を入力して選べる（https のみ）。選んだものは候補に並ぶ", async () => {
  const user = userEvent.setup();
  render(<MediaSection />);
  const input = screen.getByRole("textbox", { name: "アップロード先サーバーの URL" });

  await user.type(input, "http://example.com");
  await user.click(screen.getByRole("button", { name: "選択" }));
  expect(screen.getByRole("alert")).toHaveTextContent("https:// で始まるサーバーの URL を入力してください");
  expect(useMediaServer.getState().server).toBeNull();

  await user.clear(input);
  await user.type(input, "https://media.example.com/");
  await user.click(screen.getByRole("button", { name: "選択" }));
  expect(useMediaServer.getState().server).toBe("https://media.example.com");
  expect(screen.getByRole("button", { name: "media.example.com" })).toHaveAttribute("aria-pressed", "true");
  expect(input).toHaveValue("");
});

it("画像アップロードの圧縮: 既定値。範囲外は保存時に丸め、既定に戻すと消える", async () => {
  const user = userEvent.setup();
  render(<MediaSection />);

  const low = screen.getByRole("spinbutton", { name: "「低」の長辺（px）" });
  const mid = screen.getByRole("spinbutton", { name: "「中」の長辺（px）" });
  const quality = screen.getByRole("spinbutton", { name: "再エンコード品質（%）" });
  expect(low).toHaveValue(640);
  expect(mid).toHaveValue(1200);
  expect(quality).toHaveValue(85);

  await user.clear(low);
  await user.type(low, "127");
  await user.tab();
  expect(low).toHaveValue(128);
  expect(useImageCompression.getState().prefs.lowMaxDim).toBe(128);
  expect(JSON.parse(localStorage.getItem(COMPRESSION_KEY) ?? "")).toMatchObject({ lowMaxDim: 128 });

  await user.clear(quality);
  await user.type(quality, "29");
  await user.tab();
  expect(quality).toHaveValue(30);

  await user.click(screen.getByRole("button", { name: "画像アップロードの圧縮を既定に戻す" }));
  expect(low).toHaveValue(640);
  expect(quality).toHaveValue(85);
  expect(localStorage.getItem(COMPRESSION_KEY)).toBeNull();
});
