import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { setBox } from "../test/viewport";
import { type ColumnTab, ColumnTabs } from "./ColumnTabs";

const TABS: ColumnTab[] = [
  { id: "c_following", title: "フォロー中" },
  { id: "c_hashtag", title: "#nostr" },
  { id: "c_notif", title: "通知" },
];

function renderTabs(activeId: string | null, onSelect = vi.fn()) {
  const view = render(
    <ColumnTabs
      columns={TABS}
      activeId={activeId}
      onSelect={onSelect}
      onAdd={() => {}}
      menu={<button type="button">カラムメニュー</button>}
      showRelay
    />,
  );
  return { ...view, onSelect };
}

it("[#597] showRelay=false なら接続表示を出さない。true なら出す", () => {
  const { rerender } = render(
    <ColumnTabs
      columns={TABS}
      activeId="c_following"
      onSelect={() => {}}
      onAdd={() => {}}
      menu={null}
      showRelay={false}
    />,
  );
  expect(screen.queryByRole("button", { name: /^リレー接続/ })).not.toBeInTheDocument();

  rerender(
    <ColumnTabs
      columns={TABS}
      activeId="c_following"
      onSelect={() => {}}
      onAdd={() => {}}
      menu={null}
      showRelay
    />,
  );
  expect(screen.getByRole("button", { name: /^リレー接続/ })).toBeInTheDocument();
});

it("タブ 3 つと「カラム追加」。選択タブだけ aria-current と tabIndex=0。⋯ はタブ列（nav）の外", () => {
  renderTabs("c_hashtag");
  const nav = screen.getByRole("navigation", { name: "カラム" });
  expect(screen.getAllByRole("button", { name: /フォロー中|#nostr|通知/ })).toHaveLength(3);
  expect(screen.getByRole("button", { name: "カラム追加" })).toBeInTheDocument();

  const active = screen.getByRole("button", { name: "#nostr" });
  expect(active).toHaveAttribute("aria-current", "true");
  expect(active).toHaveAttribute("tabindex", "0");
  const other = screen.getByRole("button", { name: "フォロー中" });
  expect(other).not.toHaveAttribute("aria-current");
  expect(other).toHaveAttribute("tabindex", "-1");

  const menu = screen.getByRole("button", { name: "カラムメニュー" });
  expect(nav).not.toContainElement(menu);
});

it("矢印キーで隣のタブへ移ってフォーカスし、端では何もしない。End で最後へ", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  renderTabs("c_following", onSelect);

  screen.getByRole("button", { name: "フォロー中" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(onSelect).toHaveBeenLastCalledWith("c_hashtag");
  expect(screen.getByRole("button", { name: "#nostr" })).toHaveFocus();

  onSelect.mockClear();
  screen.getByRole("button", { name: "フォロー中" }).focus();
  await user.keyboard("{ArrowLeft}");
  expect(onSelect).not.toHaveBeenCalled();

  await user.keyboard("{End}");
  expect(onSelect).toHaveBeenLastCalledWith("c_notif");
  expect(screen.getByRole("button", { name: "通知" })).toHaveFocus();
});

it("画面外のタブが選択されたら前に 48px 覗かせて寄せ、完全に見えているタブでは動かさない", () => {
  const { rerender } = renderTabs("c_following");
  const strip = screen.getByRole("list");
  setBox(strip, { clientWidth: 300 });
  setBox(screen.getByRole("button", { name: "#nostr" }), { offsetLeft: 100, offsetWidth: 80 });
  setBox(screen.getByRole("button", { name: "通知" }), { offsetLeft: 280, offsetWidth: 80 });

  const props = { columns: TABS, onSelect: () => {}, onAdd: () => {}, menu: null, showRelay: true };
  rerender(<ColumnTabs {...props} activeId="c_hashtag" />);
  expect(strip.scrollLeft).toBe(0);

  rerender(<ColumnTabs {...props} activeId="c_notif" />);
  expect(strip.scrollLeft).toBe(232);
});
