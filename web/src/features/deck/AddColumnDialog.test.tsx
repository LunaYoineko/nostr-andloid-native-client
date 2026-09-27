import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { DEFAULT_COLUMNS, decodeDeckColumns, encodeReqFilter } from "../../lib/columns";
import { COLUMNS_KEY, useDeck } from "../../store/deck";
import { AddColumnDialog } from "./AddColumnDialog";

// jsdom は <dialog> の showModal / close を持たないので、開閉と close イベントだけを足す
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

beforeEach(() => {
  useDeck.setState({ columns: [...DEFAULT_COLUMNS], showAddColumn: true, jumpTarget: null });
});

afterEach(() => {
  localStorage.clear();
});

it("ハッシュタグ Nostr を足すと #Nostr のカラムが末尾に増えて保存され、ダイアログが閉じる", async () => {
  const user = userEvent.setup();
  render(<AddColumnDialog />);
  expect(screen.getByRole("dialog", { name: "カラムを追加" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /^ハッシュタグ/ }));
  const add = screen.getByRole("button", { name: "追加" });
  expect(add).toBeDisabled();
  await user.type(screen.getByRole("textbox", { name: "ハッシュタグ" }), "Nostr");
  await user.click(add);

  const { columns, jumpTarget, showAddColumn } = useDeck.getState();
  const added = columns.at(-1);
  expect(columns).toHaveLength(4);
  expect(added).toMatchObject({ kind: "HASHTAG", title: "#Nostr", pinned: true });
  expect(added?.filter.hashtags).toEqual(["Nostr"]);
  expect(jumpTarget).toBe(added?.id);
  expect(decodeDeckColumns(localStorage.getItem(COLUMNS_KEY) ?? "")?.at(-1)?.title).toBe("#Nostr");
  expect(showAddColumn).toBe(false);
});

it('「DM」は通知の次に並び、押すと {"kinds":[14]} の DM カラムが増える（#506）', async () => {
  const user = userEvent.setup();
  render(<AddColumnDialog />);
  const labels = screen
    .getAllByRole("button")
    .map((b) => b.textContent ?? "")
    .filter((t) => t !== "");
  expect(labels[labels.findIndex((t) => t.startsWith("通知")) + 1]).toBe("DM");

  await user.click(screen.getByRole("button", { name: "DM" }));
  const added = useDeck.getState().columns.at(-1);
  expect(added).toMatchObject({ kind: "DM", title: "DM", subtitle: "NIP-17", renderer: "FEED" });
  expect(added && encodeReqFilter(added.filter)).toBe('{"kinds":[14]}');
  expect(useDeck.getState().showAddColumn).toBe(false);
});

it("指定 npub の投稿に読めない文字列を入れるとエラーを出し、追加しない", async () => {
  const user = userEvent.setup();
  render(<AddColumnDialog />);

  await user.click(screen.getByRole("button", { name: /^指定 npub の投稿/ }));
  await user.type(screen.getByRole("textbox", { name: "指定 npub の投稿" }), "abc");
  await user.click(screen.getByRole("button", { name: "追加" }));

  expect(screen.getByText("npub または hex を入力")).toBeInTheDocument();
  expect(useDeck.getState().columns).toHaveLength(3);
  expect(useDeck.getState().showAddColumn).toBe(true);
});
