import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSession } from "../signer/session";
import { resetSession } from "../test/fakeNostr";
import { App } from "./App";

// App はモジュール読み込み時に createBrowserRouter を作るので、import より前に URL を /app/ にしておく
vi.hoisted(() => {
  window.history.replaceState(null, "", "/app/");
});

afterEach(() => {
  resetSession();
});

it("未ログインなら /app/login?next=%2F のゲート（Nostrism の見出し）を描画する", async () => {
  await useSession.getState().restore();
  render(<App />);

  expect(await screen.findByRole("heading", { name: /Nostrism/ })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/app/login");
  expect(window.location.search).toBe("?next=%2F");
});
