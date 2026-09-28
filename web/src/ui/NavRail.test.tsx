import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { NavKey } from "../app/navState";
import { NavRail, type RailPinned } from "./NavRail";

const NONE: Record<NavKey, boolean> = {
  home: false,
  search: false,
  messages: false,
  notifications: false,
  settings: false,
};

const PINNED: RailPinned[] = [
  { id: "c_following", title: "フォロー中", kind: "FOLLOWING", active: false },
  { id: "c_hashtag", title: "#nostr", kind: "HASHTAG", active: true },
  { id: "c_notif", title: "通知", kind: "NOTIFICATIONS", active: false },
];

function renderRail(props: Partial<Parameters<typeof NavRail>[0]> = {}) {
  const handlers = { onSelect: vi.fn(), onOpenColumn: vi.fn(), onAddColumn: vi.fn() };
  render(
    <NavRail
      selected={NONE}
      homeActive={false}
      pinned={PINNED}
      showNotifications={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

/** ブランド画像とボタンを DOM の順に並べる（リレーの接続表示のボタンは除く。別に確かめる） */
function railItems() {
  const nav = screen.getByRole("navigation", { name: "メイン" });
  return [...nav.querySelectorAll("img[alt='Nostrism'], button:not([aria-label^='リレー接続'])")].map(
    (el) => el.getAttribute("aria-label") ?? `img:${el.getAttribute("alt")}`,
  );
}

it("ブランド → ホーム → 目次 → カラム追加 → 検索 → メッセージ → 設定の順（通知カラムがあれば通知は出さない）", () => {
  renderRail();
  expect(railItems()).toEqual([
    "img:Nostrism",
    "ホーム",
    "フォロー中",
    "#nostr",
    "通知",
    "カラム追加",
    "検索",
    "メッセージ",
    "設定",
  ]);
  const nav = screen.getByRole("navigation", { name: "メイン" });
  expect(within(nav).getByRole("button", { name: /^リレー接続 / })).toBeInTheDocument();
});

it("通知カラムが無ければ検索・メッセージ・通知の順に出す", () => {
  renderRail({ pinned: PINNED.slice(0, 2), showNotifications: true });
  expect(railItems().slice(-4)).toEqual(["検索", "メッセージ", "通知", "設定"]);
});

it("目次の選択は aria-current=true、ホームの選択は aria-current=page", () => {
  renderRail({ homeActive: true });
  expect(screen.getByRole("button", { name: "#nostr" })).toHaveAttribute("aria-current", "true");
  expect(screen.getByRole("button", { name: "フォロー中" })).not.toHaveAttribute("aria-current");
  expect(screen.getByRole("button", { name: "ホーム" })).toHaveAttribute("aria-current", "page");
});

it("目次で onOpenColumn、カラム追加で onAddColumn、宛先で onSelect", async () => {
  const user = userEvent.setup();
  const { onSelect, onOpenColumn, onAddColumn } = renderRail();

  await user.click(screen.getByRole("button", { name: "#nostr" }));
  expect(onOpenColumn).toHaveBeenCalledWith("c_hashtag");

  await user.click(screen.getByRole("button", { name: "カラム追加" }));
  expect(onAddColumn).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("button", { name: "検索" }));
  expect(onSelect).toHaveBeenCalledWith("search");
});

it("メッセージの未読数をアイコンに重ねる（99+ まで）。0 なら出さない", async () => {
  const user = userEvent.setup();
  const { onSelect } = renderRail({ badges: { messages: 3 } });
  const messages = screen.getByRole("button", { name: "メッセージ（未読 3 件）" });
  expect(messages).toHaveTextContent("3");
  await user.click(messages);
  expect(onSelect).toHaveBeenCalledWith("messages");
  cleanup();

  renderRail({ badges: { messages: 150 } });
  expect(screen.getByRole("button", { name: "メッセージ（未読 150 件）" })).toHaveTextContent("99+");
  cleanup();

  renderRail({ badges: { messages: 0 } });
  expect(screen.getByRole("button", { name: "メッセージ" }).textContent).toBe("");
});
