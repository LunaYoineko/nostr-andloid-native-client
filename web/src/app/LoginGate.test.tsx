import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { npubEncode } from "nostr-tools/nip19";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, it } from "vitest";
import { SESSION_FLAG_KEY, SESSION_KEY, useSession } from "../signer/session";
import { installFakeNostr, PUBKEY, resetSession } from "../test/fakeNostr";
import { routes } from "./routes";

afterEach(() => {
  resetSession();
});

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { basename: "/app", initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

it("ログインに成功すると next へ戻り、ヘッダに npub の短縮が出る", async () => {
  installFakeNostr();
  useSession.setState({ status: "out" });
  const router = renderAt("/app/login?next=%2F");

  await userEvent.click(screen.getByRole("button", { name: "拡張機能でログイン（NIP-07）" }));

  expect(await screen.findByText(`${npubEncode(PUBKEY).slice(0, 12)}…`)).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/app");
  expect(useSession.getState().status).toBe("in");
  expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
  expect(localStorage.getItem(SESSION_FLAG_KEY)).toBe("1");
});

it("拡張が拒否したらエラー文言を画面に出す", async () => {
  installFakeNostr({ reject: true });
  useSession.setState({ status: "out" });
  renderAt("/app/login");

  await userEvent.click(screen.getByRole("button", { name: "拡張機能でログイン（NIP-07）" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("許可されなかった");
  expect(useSession.getState().status).toBe("out");
});

it("拡張が無ければ nos2x / Alby / Nostash の案内を出す", async () => {
  useSession.setState({ status: "out" });
  renderAt("/app/login");

  const help = await screen.findByRole("region", { name: "拡張機能の案内" }, { timeout: 3000 });
  for (const name of ["nos2x", "Alby", "Nostash"]) {
    const link = screen.getByRole("link", { name });
    expect(help).toContainElement(link);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
});

it("ログアウトで localStorage が空になりゲートへ戻る", async () => {
  installFakeNostr();
  await useSession.getState().login();
  renderAt("/app/");

  await userEvent.click(await screen.findByRole("button", { name: "ログアウト" }));

  expect(await screen.findByRole("button", { name: "拡張機能でログイン（NIP-07）" })).toBeInTheDocument();
  expect(localStorage.length).toBe(0);
  expect(useSession.getState().status).toBe("out");
});
