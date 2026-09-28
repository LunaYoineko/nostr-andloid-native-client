import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { LinkCard, LinkCards } from "./LinkCard";

const URL = "https://www.example.test/articles/1";

it("サムネ（プロキシ経由）・サイト名・タイトル・説明・URL を出し、全体が新しいタブで開くリンク", () => {
  render(
    <LinkCard
      url={URL}
      kind="ogp"
      ogp={{
        url: URL,
        title: "記事のタイトル",
        description: "記事の説明",
        image: "https://cdn.example.test/og.png",
        siteName: "Example",
      }}
    />,
  );

  const link = screen.getByRole("link");
  expect(link).toHaveAttribute("href", URL);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link.getAttribute("rel")).toContain("noopener noreferrer");
  expect(link).toHaveTextContent("Example");
  expect(link).toHaveTextContent("記事のタイトル");
  expect(link).toHaveTextContent("記事の説明");
  expect(link).toHaveTextContent(URL);

  const img = link.querySelector("img");
  expect(img?.getAttribute("src")).toContain(
    "https://wsrv.nl/?url=https%3A%2F%2Fcdn.example.test%2Fog.png&w=300",
  );
  expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
});

it("サイト名が無ければドメイン（www. を落とす）。画像が無い・読めなければサムネを出さない", () => {
  const { container, rerender } = render(<LinkCard url={URL} ogp={{ url: URL, title: "t" }} />);
  expect(screen.getByText("example.test")).toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull();

  rerender(<LinkCard url={URL} ogp={{ url: URL, title: "t", image: "https://cdn.example.test/x.png" }} />);
  const img = container.querySelector("img") as HTMLImageElement;
  fireEvent.error(img);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByRole("link")).toHaveTextContent("t");
});

it("OGP の文字は HTML として解釈しない", () => {
  const { container } = render(<LinkCard url={URL} ogp={{ url: URL, title: "<b>太字</b>" }} />);
  expect(container.querySelector("b")).toBeNull();
  expect(screen.getByText("<b>太字</b>")).toBeInTheDocument();
});

it('ogpImages が false なら画像を出さない。Spotify（kind="spotify"）は false でも画像を出す', () => {
  const ogp = { url: URL, title: "t", image: "https://cdn.example.test/x.png" };
  const { container, rerender } = render(<LinkCard url={URL} ogp={ogp} kind="ogp" ogpImages={false} />);
  expect(container.querySelector("img")).toBeNull();

  rerender(<LinkCard url={URL} ogp={ogp} kind="spotify" ogpImages={false} />);
  expect(container.querySelector("img")).not.toBeNull();
});

it("LinkCards: 取得中は枠（読み上げない）、取れなかったものは出さない、全部無ければ何も描かない", () => {
  const { container, rerender } = render(
    <LinkCards
      cards={[
        { url: "https://a.test/1", kind: "ogp", ogp: undefined },
        { url: "https://b.test/2", kind: "ogp", ogp: null },
        { url: "https://c.test/3", kind: "ogp", ogp: { url: "https://c.test/3", title: "C" } },
      ]}
    />,
  );
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link")).toHaveAttribute("href", "https://c.test/3");
  const placeholder = container.querySelector("[aria-hidden='true']");
  expect(placeholder).toHaveTextContent("a.test");
  expect(container).not.toHaveTextContent("b.test");

  rerender(<LinkCards cards={[{ url: "https://b.test/2", kind: "ogp", ogp: null }]} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<LinkCards cards={[]} />);
  expect(container).toBeEmptyDOMElement();
});
