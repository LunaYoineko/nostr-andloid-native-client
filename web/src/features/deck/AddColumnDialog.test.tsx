import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { DEFAULT_COLUMNS, decodeDeckColumns, encodeReqFilter } from "../../lib/columns";
import { addVerified } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { COLUMNS_KEY, useDeck } from "../../store/deck";
import { USED_HASHTAGS_KEY } from "../compose/storage";
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
  useSession.setState({ status: "loading", method: null, pubkey: null });
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

it("ハッシュタグ / キーワード・タグ: ピン留め・最近使ったタグのチップを押すと入力に入る（#536）", async () => {
  const meKey = generateSecretKey();
  const me = getPublicKey(meKey);
  useSession.setState({ status: "in", method: "local", pubkey: me });
  addVerified(
    finalizeEvent(
      {
        kind: 30015,
        created_at: 1,
        tags: [
          ["d", "pinned"],
          ["t", "zap"],
        ],
        content: "",
      },
      meKey,
    ),
  );
  localStorage.setItem(USED_HASHTAGS_KEY, JSON.stringify([{ tag: "bitcoin", lastUsed: 1 }]));
  const user = userEvent.setup();
  render(<AddColumnDialog />);

  await user.click(screen.getByRole("button", { name: /^ハッシュタグ/ }));
  const chips = screen.getByRole("list", { name: "ピン留め・最近使ったタグ" });
  expect(
    within(chips)
      .getAllByRole("button")
      .map((b) => b.textContent),
  ).toEqual(["#zap", "#bitcoin"]);
  await user.click(within(chips).getByRole("button", { name: "#zap" }));
  expect(screen.getByRole("textbox", { name: "ハッシュタグ" })).toHaveValue("zap");

  await user.click(screen.getByRole("button", { name: "戻る" }));
  await user.click(screen.getByRole("button", { name: /^キーワード・タグ/ }));
  const searchChips = screen.getByRole("list", { name: "ピン留め・最近使ったタグ" });
  await user.type(screen.getByRole("textbox", { name: "キーワード・タグ" }), "hello");
  await user.click(within(searchChips).getByRole("button", { name: "#bitcoin" }));
  expect(screen.getByRole("textbox", { name: "キーワード・タグ" })).toHaveValue("hello #bitcoin");
});
