import { act, render, screen } from "@testing-library/react";
import { npubEncode } from "nostr-tools/nip19";
import { useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { PUBKEY } from "../test/fakeNostr";
import { canGoBackInApp, synthesizeBaseEntry, transientIdOf, useCloseMenuOnBack } from "./history";

function nextPopState(): Promise<void> {
  return new Promise((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }));
}

it("canGoBackInApp は idx > 0 のときだけ true", () => {
  expect(canGoBackInApp({ idx: 1 })).toBe(true);
  expect(canGoBackInApp({ idx: 0 })).toBe(false);
  expect(canGoBackInApp(null)).toBe(false);
  expect(canGoBackInApp({})).toBe(false);
});

describe("synthesizeBaseEntry", () => {
  it("履歴の先頭の /app/e/… なら下に /app/ を敷き、戻るとデッキ（idx 0）になる", async () => {
    window.history.replaceState(null, "", "/app/e/note1abc");
    const length = window.history.length;

    expect(synthesizeBaseEntry(window)).toBe(true);
    expect(window.location.pathname).toBe("/app/e/note1abc");
    expect(window.history.state.idx).toBe(1);
    expect(window.history.length).toBe(length + 1);

    const popped = nextPopState();
    window.history.back();
    await popped;
    expect(window.location.pathname).toBe("/app/");
    expect(window.history.state.idx).toBe(0);
  });

  it("/app/p/npub1… と /app/t/nostr でも敷く", () => {
    for (const path of [`/app/p/${npubEncode(PUBKEY)}`, "/app/t/nostr"]) {
      window.history.replaceState(null, "", path);
      expect(synthesizeBaseEntry(window)).toBe(true);
      expect(window.location.pathname).toBe(path);
    }
  });

  it("詳細以外のパス・深いパス・既にアプリ内の履歴がある状態では何もしない", () => {
    for (const path of ["/app/", "/app/search", "/app/e/x/y"]) {
      window.history.replaceState(null, "", path);
      const length = window.history.length;
      expect(synthesizeBaseEntry(window)).toBe(false);
      expect(window.location.pathname).toBe(path);
      expect(window.history.state).toBeNull();
      expect(window.history.length).toBe(length);
    }

    window.history.replaceState({ idx: 2 }, "", "/app/e/note1abc");
    const length = window.history.length;
    expect(synthesizeBaseEntry(window)).toBe(false);
    expect(window.history.state).toEqual({ idx: 2 });
    expect(window.history.length).toBe(length);
  });
});

it("transientIdOf は deckTransient が文字列のときだけ返す", () => {
  expect(transientIdOf({ deckTransient: "x" })).toBe("x");
  expect(transientIdOf(null)).toBeNull();
  expect(transientIdOf({ deckTransient: 1 })).toBeNull();
});

/** [#540] ⋯ メニューの代わり: open の間だけメニューが開いている想定のハーネス */
function MenuHarness() {
  const [open, setOpen] = useState(false);
  const [closes, setCloses] = useState(0);
  useCloseMenuOnBack(open, () => {
    setOpen(false);
    setCloses((c) => c + 1);
  });
  return (
    <div>
      <span data-testid="open">{String(open)}</span>
      <span data-testid="closes">{closes}</span>
      <button type="button" onClick={() => setOpen(true)}>
        開く
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        別の理由で閉じる
      </button>
    </div>
  );
}

function renderHarness() {
  return createMemoryRouter(
    [
      { path: "/a", element: <p>A画面</p> },
      { path: "/b", element: <MenuHarness /> },
    ],
    { initialEntries: ["/a", "/b"], initialIndex: 1 },
  );
}

describe("useCloseMenuOnBack", () => {
  it("開いている間の「戻る」はメニューを閉じるだけ（裏の画面へは行かない）。もう一度戻ると行く", async () => {
    const router = renderHarness();
    render(<RouterProvider router={router} />);

    await act(async () => screen.getByRole("button", { name: "開く" }).click());
    expect(screen.getByTestId("open")).toHaveTextContent("true");

    await act(async () => router.navigate(-1));
    expect(screen.getByTestId("open")).toHaveTextContent("false");
    expect(screen.getByTestId("closes")).toHaveTextContent("1");
    expect(screen.queryByText("A画面")).not.toBeInTheDocument();

    await act(async () => router.navigate(-1));
    expect(screen.getByText("A画面")).toBeInTheDocument();
  });

  it("項目選択・Escape 等（戻る以外）で閉じたら積んだ分を自分で戻り、次の本当の戻るは 1 回で済む", async () => {
    const router = renderHarness();
    render(<RouterProvider router={router} />);

    await act(async () => screen.getByRole("button", { name: "開く" }).click());
    await act(async () => screen.getByRole("button", { name: "別の理由で閉じる" }).click());
    expect(screen.getByTestId("open")).toHaveTextContent("false");
    expect(screen.getByTestId("closes")).toHaveTextContent("0");

    await act(async () => router.navigate(-1));
    expect(screen.getByText("A画面")).toBeInTheDocument();
  });
});
