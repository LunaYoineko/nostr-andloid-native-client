import { afterEach, beforeEach, expect, it } from "vitest";
import { useSession } from "../signer/session";
import { resetSession } from "../test/fakeNostr";
import { initLpVisibility } from "./lpVisibility";

/** router.subscribe / router.state を模した最小のフェイク */
function fakeRouter(pathname: string) {
  const listeners: Array<() => void> = [];
  const router = {
    state: { location: { pathname } },
    subscribe(fn: () => void) {
      listeners.push(fn);
      return () => {};
    },
    navigate(next: string) {
      router.state = { location: { pathname: next } };
      for (const fn of listeners) fn();
    },
  };
  return router;
}

beforeEach(() => {
  document.body.insertAdjacentHTML("afterbegin", '<div id="lp"></div>');
});

afterEach(() => {
  document.getElementById("lp")?.remove();
  document.documentElement.classList.remove("signed-in");
  resetSession();
});

it("/ はセッション復元中・未ログインの間は LP を出したまま", () => {
  const router = fakeRouter("/");
  useSession.setState({ status: "loading", method: null, pubkey: null });
  initLpVisibility(router);
  expect(document.getElementById("lp")).not.toHaveAttribute("hidden");

  useSession.setState({ status: "out", method: null, pubkey: null });
  expect(document.getElementById("lp")).not.toHaveAttribute("hidden");
  expect(document.documentElement).not.toHaveClass("signed-in");
});

it("/ はログイン済みなら LP を隠し、<html> に signed-in を付ける", () => {
  const router = fakeRouter("/");
  initLpVisibility(router);

  useSession.setState({ status: "in", method: "nip07", pubkey: "pk" });
  expect(document.getElementById("lp")).toHaveAttribute("hidden");
  expect(document.documentElement).toHaveClass("signed-in");
});

it("/about はログイン状態によらず常に LP を出す", () => {
  const router = fakeRouter("/about");
  useSession.setState({ status: "in", method: "nip07", pubkey: "pk" });
  initLpVisibility(router);
  expect(document.getElementById("lp")).not.toHaveAttribute("hidden");
});

it("/login 等ほかのルートは常に LP を隠す", () => {
  const router = fakeRouter("/login");
  useSession.setState({ status: "out", method: null, pubkey: null });
  initLpVisibility(router);
  expect(document.getElementById("lp")).toHaveAttribute("hidden");
});

it("ナビゲーション（router.subscribe）で再判定する", () => {
  const router = fakeRouter("/settings");
  useSession.setState({ status: "in", method: "nip07", pubkey: "pk" });
  initLpVisibility(router);
  expect(document.getElementById("lp")).toHaveAttribute("hidden");

  router.navigate("/about");
  expect(document.getElementById("lp")).not.toHaveAttribute("hidden");

  router.navigate("/");
  expect(document.getElementById("lp")).toHaveAttribute("hidden");
});
