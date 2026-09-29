import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSession } from "../signer/session";
import { resetSession } from "../test/fakeNostr";
import { App } from "./App";

// App はモジュール読み込み時に createBrowserRouter を作るので、import より前に URL を / にしておく
vi.hoisted(() => {
  window.history.replaceState(null, "", "/");
});

// #lp は React の外（静的 HTML）にある想定なので、実物と同じ形に differ を差し込む（lpVisibility.ts の対象）
beforeEach(() => {
  document.body.insertAdjacentHTML("afterbegin", '<div id="lp"></div>');
});

afterEach(() => {
  document.getElementById("lp")?.remove();
  document.documentElement.classList.remove("signed-in");
  resetSession();
});

it("未ログインなら / のまま何も描かず、LP（#lp）は隠さない（#647）", async () => {
  await useSession.getState().restore();
  render(<App />);

  expect(screen.queryByRole("main")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /Nostrism/ })).not.toBeInTheDocument();
  expect(window.location.pathname).toBe("/");
  expect(document.getElementById("lp")).not.toHaveAttribute("hidden");
  expect(document.documentElement).not.toHaveClass("signed-in");
});
