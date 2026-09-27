import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { YouTubeCard } from "./YouTubeCard";
import styles from "./YouTubeCard.module.css";

const URL = "https://youtu.be/dQw4w9WgXcQ";
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

it("サムネ + 再生ボタン + 「YouTube」のカードで、押すと新しいタブで開く（iframe は出さない）", () => {
  const { container } = render(<YouTubeCard url={URL} id={ID} />);

  const link = screen.getByRole("link", { name: "YouTube で開く" });
  expect(link).toHaveAttribute("href", URL);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link.getAttribute("rel")).toContain("noopener noreferrer");
  const img = link.querySelector("img");
  expect(img).toHaveAttribute("src", `https://img.youtube.com/vi/${ID}/hqdefault.jpg`);
  expect(img?.getAttribute("src")).not.toContain("wsrv.nl");
  expect(container.querySelector("iframe")).toBeNull();
  expect(screen.getByText("YouTube")).toBeInTheDocument();
});

it("サムネが読めなければ隠して黒地のまま", () => {
  const { container } = render(<YouTubeCard url={URL} id={ID} />);
  const img = container.querySelector("img") as HTMLImageElement;

  fireEvent.error(img);

  expect(img).toHaveClass(styles.hidden);
  expect(screen.getByRole("link", { name: "YouTube で開く" })).toBeInTheDocument();
});

it("oEmbed が取れたらサムネの上端にタイトルとチャンネル名の帯を出す", async () => {
  const id = "aaaaaaaaaa1";
  fetchMock.mockImplementation(async () =>
    Response.json({ title: "動画のタイトル", author_name: "チャンネル名" }),
  );
  const { container } = render(<YouTubeCard url={`https://youtu.be/${id}`} id={id} />);

  expect(await screen.findByText("動画のタイトル")).toHaveClass(styles.bandTitle);
  expect(screen.getByText("チャンネル名")).toHaveClass(styles.bandAuthor);
  expect(container.querySelector(`.${styles.band}`)).not.toBeNull();
  expect(fetchMock).toHaveBeenCalledWith(`/api/oembed?v=${id}`, expect.anything());
});

it("oEmbed が取れなければ帯を出さない", async () => {
  const id = "aaaaaaaaaa2";
  const { container } = render(<YouTubeCard url={`https://youtu.be/${id}`} id={id} />);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await Promise.resolve();
  expect(container.querySelector(`.${styles.band}`)).toBeNull();
});
