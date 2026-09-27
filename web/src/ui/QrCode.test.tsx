import { render, screen } from "@testing-library/react";
import { encode } from "uqr";
import { expect, it } from "vitest";
import { QrCode } from "./QrCode";

const VALUE = "nostrconnect://0123abcd?secret=s&relay=wss%3A%2F%2Fnos.lol";

it("viewBox は 0 0 n n（n = encode の size）で、黒のマスは encode の true と同じ数。白地に黒", () => {
  const { data, size } = encode(VALUE, { ecc: "M", border: 2 });

  render(<QrCode value={VALUE} label="接続用の QR コード" />);

  const svg = screen.getByRole("img", { name: "接続用の QR コード" });
  expect(svg).toHaveAttribute("viewBox", `0 0 ${size} ${size}`);
  expect(svg).toHaveAttribute("width", "240");
  expect(svg.querySelector("rect")).toHaveAttribute("fill", "#fff");
  const path = svg.querySelector("path");
  expect(path).toHaveAttribute("fill", "#000");
  const dark = data.flat().filter(Boolean).length;
  expect(dark).toBeGreaterThan(0);
  expect(path?.getAttribute("d")?.match(/h1v1h-1z/g)).toHaveLength(dark);
});

it("size で表示の大きさを変える", () => {
  render(<QrCode value={VALUE} size={160} label="QR" />);

  const svg = screen.getByRole("img", { name: "QR" });
  expect(svg).toHaveAttribute("width", "160");
  expect(svg).toHaveAttribute("height", "160");
});
