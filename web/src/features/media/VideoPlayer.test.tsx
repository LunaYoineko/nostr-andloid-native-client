import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VideoPlayer } from "./VideoPlayer";

const BLURHASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";
const originalPlay = HTMLMediaElement.prototype.play;
const originalPause = HTMLMediaElement.prototype.pause;
const pause = vi.fn();

beforeEach(() => {
  // jsdom は再生を実装していない
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = pause;
  pause.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  HTMLMediaElement.prototype.play = originalPlay;
  HTMLMediaElement.prototype.pause = originalPause;
  vi.restoreAllMocks();
});

it("最初はポスター（thumb を 800px 幅のプロキシで）+ ▶ + 「動画」だけで、<video> を作らない", () => {
  const { container } = render(
    <VideoPlayer item={{ url: "https://v.test/a.mp4", thumb: "https://v.test/a.jpg", blurhash: BLURHASH }} />,
  );

  expect(container.querySelector("video")).toBeNull();
  const button = screen.getByRole("button", { name: "動画を再生" });
  const img = button.querySelector("img");
  expect(img?.getAttribute("src")).toContain("wsrv.nl");
  expect(img?.getAttribute("src")).toContain("w=800");
  expect(img).toHaveAttribute("alt", "");
  expect(screen.getByText("動画")).toBeInTheDocument();
});

it("thumb が無ければ blurhash、どちらも無ければ黒地だけ", () => {
  const { container, unmount } = render(
    <VideoPlayer item={{ url: "https://v.test/a.mp4", blurhash: BLURHASH }} />,
  );
  expect(container.querySelector("canvas")).not.toBeNull();
  expect(container.querySelector("img")).toBeNull();
  unmount();

  const bare = render(<VideoPlayer item={{ url: "https://v.test/a.mp4" }} />);
  expect(bare.container.querySelector("canvas")).toBeNull();
  expect(bare.container.querySelector("img")).toBeNull();
  expect(screen.getByRole("button", { name: "動画を再生" })).toBeInTheDocument();
});

it("https でない thumb はポスターに使わない", () => {
  const { container } = render(
    <VideoPlayer item={{ url: "https://v.test/a.mp4", thumb: "http://v.test/a.jpg" }} />,
  );

  expect(container.querySelector("img")).toBeNull();
});

it("押すと原 URL の <video> を無音・インライン・標準コントロールで出す", async () => {
  const { container } = render(
    <VideoPlayer item={{ url: "https://v.test/a.mp4", thumb: "https://v.test/a.jpg" }} />,
  );

  await userEvent.click(screen.getByRole("button", { name: "動画を再生" }));

  const videos = container.querySelectorAll("video");
  expect(videos).toHaveLength(1);
  const video = videos[0];
  expect(video).toHaveAttribute("src", "https://v.test/a.mp4");
  expect(video).toHaveAttribute("controls");
  expect(video).toHaveAttribute("muted");
  expect(video.muted).toBe(true);
  expect(video).toHaveAttribute("playsinline");
  expect(video).toHaveAttribute("autoplay");
  expect(video).toHaveAttribute("preload", "metadata");
  expect(video.getAttribute("poster")).toContain("w=800");
  expect(screen.queryByRole("button", { name: "動画を再生" })).toBeNull();
});

it("2 本目の再生が始まると 1 本目を止める", async () => {
  const { container } = render(
    <>
      <VideoPlayer item={{ url: "https://v.test/1.mp4" }} />
      <VideoPlayer item={{ url: "https://v.test/2.mp4" }} />
    </>,
  );
  for (const button of screen.getAllByRole("button", { name: "動画を再生" })) await userEvent.click(button);
  const [first, second] = container.querySelectorAll("video");

  fireEvent.play(first);
  expect(pause).not.toHaveBeenCalled();
  fireEvent.play(second);

  expect(pause).toHaveBeenCalledTimes(1);
  expect(pause.mock.contexts[0]).toBe(first);
});

it("https でない動画は押しても <video> を出さない", async () => {
  const { container } = render(<VideoPlayer item={{ url: "http://v.test/a.mp4" }} />);

  await userEvent.click(screen.getByRole("button", { name: "動画を再生" }));

  expect(container.querySelector("video")).toBeNull();
});
