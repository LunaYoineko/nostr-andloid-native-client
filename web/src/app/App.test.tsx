import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { App } from "./App";

it("Nostrism の見出しを描画する", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /Nostrism/ })).toBeInTheDocument();
});
