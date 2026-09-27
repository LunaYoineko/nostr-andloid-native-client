import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { YouTubeCard } from "./YouTubeCard";
import styles from "./YouTubeCard.module.css";

const URL = "https://youtu.be/dQw4w9WgXcQ";
const ID = "dQw4w9WgXcQ";

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
