import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LinkCards } from "./LinkCard";
import { XPostCard, XPostEmbed } from "./XPostCard";
import styles from "./XPostCard.module.css";
import type { XPost } from "./xPost";

const loaders = vi.hoisted(() => ({
  loadDate: vi.fn<(url: string, lang: string) => Promise<string | null>>(),
  loadOgp: vi.fn<(url: string) => Promise<{ url: string; image?: string } | null>>(),
}));
vi.mock("./xPostLoader", () => ({
  xPostDateLoader: { peek: () => undefined, load: loaders.loadDate },
}));
vi.mock("./ogpLoader", () => ({ ogpLoader: { peek: () => undefined, load: loaders.loadOgp } }));

const URL = "https://x.com/sweetroad5/status/2106722627310284812";
const POST: XPost = {
  url: URL,
  name: "極上のスイーツ",
  handle: "sweetroad5",
  text: "1 行目\n2 行目\n3 行目\n4 行目\n5 行目",
  image: "https://pbs.twimg.com/media/abc.jpg",
  avatar: "https://pbs.twimg.com/profile_images/1/a_400x400.jpg",
};

beforeEach(() => {
  loaders.loadDate.mockReset().mockResolvedValue(null);
  loaders.loadOgp.mockReset().mockResolvedValue(null);
});

it("名前・@ハンドル · 日付・本文・写真・アイコン・X のロゴ・「X で開く」（新しいタブ）を出す", () => {
  const { container } = render(<XPostCard post={POST} date="2026年10月4日" avatar={POST.avatar} />);

  expect(screen.getByText("極上のスイーツ")).toBeInTheDocument();
  expect(screen.getByText("@sweetroad5 · 2026年10月4日")).toBeInTheDocument();
  expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  const text = container.querySelector(`.${styles.text}`);
  expect(text?.textContent).toBe(POST.text);

  const imgs = [...container.querySelectorAll("img")];
  expect(imgs).toHaveLength(2);
  expect(imgs[0].getAttribute("src")).toContain(encodeURIComponent(POST.avatar as string));
  expect(imgs[1].getAttribute("src")).toContain(encodeURIComponent(POST.image as string));
  expect(imgs[1]).toHaveClass(styles.photo);

  const link = screen.getByRole("link");
  expect(link).toHaveAttribute("href", URL);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link.getAttribute("rel")).toContain("noopener noreferrer");
});

it("本文は 4 行まで。カードのタップで全文と折りたたみを切り替える（「X で開く」のタップでは切り替えない）", () => {
  const { container } = render(<XPostCard post={POST} />);
  const button = screen.getByRole("button");
  const text = container.querySelector(`.${styles.text}`);
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(text).not.toHaveClass(styles.expanded);

  fireEvent.click(container.querySelector("article") as HTMLElement);
  expect(button).toHaveAttribute("aria-expanded", "true");
  expect(text).toHaveClass(styles.expanded);

  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(text).not.toHaveClass(styles.expanded);

  fireEvent.click(screen.getByRole("link"));
  expect(button).toHaveAttribute("aria-expanded", "false");
});

it("日付・写真・アイコンが無ければ出さない（アイコンは頭文字の丸、2 行目はハンドルだけ）", () => {
  const { container } = render(<XPostCard post={{ ...POST, image: null, avatar: null }} />);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("@sweetroad5")).toBeInTheDocument();
  expect(container.querySelector(`.${styles.initial}`)).toHaveTextContent("極");
});

it("名前が読めなければハンドルを名前の行に出す", () => {
  render(<XPostCard post={{ ...POST, name: null, image: null }} />);
  expect(screen.getByText("sweetroad5")).toBeInTheDocument();
});

it("画像を読まない設定（ogpImages: false）なら写真もアイコンも出さない", () => {
  const { container } = render(<XPostCard post={POST} avatar={POST.avatar} ogpImages={false} />);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector(`.${styles.initial}`)).not.toBeNull();
});

it("画像が読めなければ出さない", () => {
  const { container } = render(<XPostCard post={POST} avatar={POST.avatar} />);
  for (const img of [...container.querySelectorAll("img")]) fireEvent.error(img);
  expect(container.querySelector("img")).toBeNull();
});

it("XPostEmbed: 日付は oEmbed、写真付きの投稿のアイコンは投稿者のプロフィールの OGP（/profile_images/ だけ）から足す", async () => {
  loaders.loadDate.mockResolvedValue("2026年10月4日");
  loaders.loadOgp.mockResolvedValue({
    url: "https://x.com/sweetroad5",
    image: "https://pbs.twimg.com/profile_images/2/b.jpg",
  });
  const { container } = render(<XPostEmbed post={{ ...POST, avatar: null }} ogpImages />);

  await waitFor(() => expect(screen.getByText("@sweetroad5 · 2026年10月4日")).toBeInTheDocument());
  await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(2));
  expect(loaders.loadOgp).toHaveBeenCalledWith("https://x.com/sweetroad5");
  expect(loaders.loadDate).toHaveBeenCalledWith(URL, expect.stringMatching(/^(ja|en)$/));
});

it("XPostEmbed: プロフィールの OGP の画像がプロフィール画像でなければアイコンにしない。画像を読まない設定なら取りに行かない", async () => {
  loaders.loadOgp.mockResolvedValue({
    url: "https://x.com/sweetroad5",
    image: "https://pbs.twimg.com/media/banner.jpg",
  });
  const { container, unmount } = render(
    <XPostEmbed post={{ ...POST, image: null, avatar: null }} ogpImages />,
  );
  await waitFor(() => expect(loaders.loadOgp).toHaveBeenCalled());
  expect(container.querySelector("img")).toBeNull();
  unmount();

  loaders.loadOgp.mockClear();
  render(<XPostEmbed post={{ ...POST, avatar: null }} ogpImages={false} />);
  await waitFor(() => expect(loaders.loadDate).toHaveBeenCalled());
  expect(loaders.loadOgp).not.toHaveBeenCalled();
});

it("LinkCards: X の投稿で本文が取れれば投稿カード、本文が無い・削除済みは従来のリンクカード", () => {
  const ok = {
    url: URL,
    title: "Xユーザーの極上のスイーツ（@sweetroad5）さん",
    description: "新発売されます",
    image: "https://pbs.twimg.com/profile_images/1/a_400x400.jpg",
  };
  const { container, rerender } = render(<LinkCards cards={[{ url: URL, kind: "ogp", ogp: ok }]} />);
  expect(container.querySelector("article")).not.toBeNull();

  rerender(<LinkCards cards={[{ url: URL, kind: "ogp", ogp: { ...ok, description: "" } }]} />);
  expect(container.querySelector("article")).toBeNull();
  expect(screen.getByRole("link")).toHaveAttribute("href", URL);

  const other = "https://example.test/a";
  rerender(
    <LinkCards cards={[{ url: other, kind: "ogp", ogp: { url: other, title: "t", description: "d" } }]} />,
  );
  expect(container.querySelector("article")).toBeNull();
});

it("カードのタップは投稿（スレッド）を開かない（useOpenOnClick が data-no-open を除外する）", () => {
  const { container } = render(<XPostCard post={POST} />);
  expect(container.querySelector("article")).toHaveAttribute("data-no-open");
});
