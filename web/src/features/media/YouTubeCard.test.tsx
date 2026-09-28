import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { YouTubeCard } from "./YouTubeCard";
import styles from "./YouTubeCard.module.css";

const ID = "dQw4w9WgXcQ";

// タイトル帯の /api/oembed は通信しない（既定は失敗 = 帯なし）
const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 502 }));
beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("押すまではサムネ + 再生ボタンを出し、iframe は置かない（データセーバーに関係なく常に）", () => {
  const { container } = render(<YouTubeCard id={ID} />);

  expect(container.querySelector("iframe")).toBeNull();
  const button = screen.getByRole("button", { name: "YouTube を再生" });
  const img = button.querySelector("img");
  expect(img).toHaveAttribute("src", `https://img.youtube.com/vi/${ID}/hqdefault.jpg`);
  expect(img?.getAttribute("src")).not.toContain("wsrv.nl");
  expect(screen.getByText("YouTube")).toBeInTheDocument();
});

it("押すと iframe（autoplay=1）に差し替わり、referrerpolicy が付く", async () => {
  const { container } = render(<YouTubeCard id={ID} />);

  fireEvent.click(screen.getByRole("button", { name: "YouTube を再生" }));

  const frame = container.querySelector("iframe");
  expect(frame).toHaveAttribute("src", `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`);
  expect(frame).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  expect(screen.queryByRole("button", { name: "YouTube を再生" })).toBeNull();
});

it("サムネが読めなければ隠して黒地のまま", () => {
  const { container } = render(<YouTubeCard id={ID} />);
  const img = container.querySelector("img") as HTMLImageElement;

  fireEvent.error(img);

  expect(img).toHaveClass(styles.hidden);
  expect(screen.getByRole("button", { name: "YouTube を再生" })).toBeInTheDocument();
});

it("oEmbed が取れたらサムネの上端にタイトルとチャンネル名の帯を出す", async () => {
  const id = "aaaaaaaaaa1";
  fetchMock.mockImplementation(async () =>
    Response.json({ title: "動画のタイトル", author_name: "チャンネル名" }),
  );
  const { container } = render(<YouTubeCard id={id} />);

  expect(await screen.findByText("動画のタイトル")).toHaveClass(styles.bandTitle);
  expect(screen.getByText("チャンネル名")).toHaveClass(styles.bandAuthor);
  expect(container.querySelector(`.${styles.band}`)).not.toBeNull();
  expect(fetchMock).toHaveBeenCalledWith(`/api/oembed?v=${id}`, expect.anything());
});

it("oEmbed が取れなければ帯を出さない", async () => {
  const id = "aaaaaaaaaa2";
  const { container } = render(<YouTubeCard id={id} />);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await Promise.resolve();
  expect(container.querySelector(`.${styles.band}`)).toBeNull();
});
