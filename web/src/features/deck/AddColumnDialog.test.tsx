import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { DEFAULT_COLUMNS, decodeDeckColumns, encodeReqFilter } from "../../lib/columns";
import { resetRelays, useRelays } from "../../nostr/pool";
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
  resetRelays();
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

it("グローバル: 読むリレーのチェック一覧 + 任意の URL 追加。件数表示と保存内容（#540）", async () => {
  const user = userEvent.setup();
  useRelays.setState({
    read: ["wss://a.example", "wss://b.example"],
    write: ["wss://a.example"],
    source: "nip65",
  });
  render(<AddColumnDialog />);

  await user.click(screen.getByRole("button", { name: /^グローバル/ }));
  expect(screen.getByText("未選択＝全リレーから取得")).toBeInTheDocument();
  // textarea ではなくチェック一覧（読むリレー 2 件）
  expect(screen.getByRole("checkbox", { name: "wss://a.example" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "wss://b.example" })).not.toBeChecked();

  await user.click(screen.getByRole("checkbox", { name: "wss://a.example" }));
  expect(screen.getByText("1 件のリレーへ配信")).toBeInTheDocument();

  const addRelayButton = screen.getByRole("button", { name: "配信先リレーを追加" });
  expect(addRelayButton).toBeDisabled();
  await user.type(screen.getByRole("textbox", { name: "配信先リレーの URL" }), "wss://c.example");
  expect(addRelayButton).toBeEnabled();
  await user.click(addRelayButton);
  expect(screen.getByRole("checkbox", { name: "wss://c.example" })).toBeChecked();
  expect(screen.getByText("2 件のリレーへ配信")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "追加" }));
  const added = useDeck.getState().columns.at(-1);
  expect(added).toMatchObject({ kind: "GLOBAL", title: "グローバル" });
  expect(added && encodeReqFilter(added.filter)).toBe(
    JSON.stringify({ relays: ["wss://a.example", "wss://c.example"] }),
  );
});

it("グローバル: wss:// で始まらない追加入力は無視する", async () => {
  const user = userEvent.setup();
  useRelays.setState({ read: [], write: [], source: "nip65" });
  render(<AddColumnDialog />);

  await user.click(screen.getByRole("button", { name: /^グローバル/ }));
  await user.type(screen.getByRole("textbox", { name: "配信先リレーの URL" }), "https://not-a-relay");
  expect(screen.getByRole("button", { name: "配信先リレーを追加" })).toBeDisabled();
});
