import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { unixNow } from "../../lib/time";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { installDialogPolyfill } from "../../test/dialog";
import { renderWithRouter } from "../../test/renderWithRouter";
import { ReactionPickerDialog } from "./ReactionPickerDialog";
import { RECENT_EMOJIS_KEY } from "./reactionPrefs";

let meKey: Uint8Array;

beforeAll(() => {
  installDialogPolyfill();
});

beforeEach(() => {
  meKey = generateSecretKey();
  useSession.setState({ status: "in", method: "nip07", pubkey: getPublicKey(meKey) });
  // 自分のカスタム絵文字 1 件（kind:10030 直下）と「最近」1 件
  eventStore.add(
    finalizeEvent(
      { kind: 10030, created_at: unixNow(), tags: [["emoji", "cat", "https://e/cat.png"]], content: "" },
      meKey,
    ),
  );
  localStorage.setItem(
    RECENT_EMOJIS_KEY,
    JSON.stringify([{ content: "🔥", imageUrl: null, lastUsed: unixNow(), uses: 1 }]),
  );
});

afterEach(() => {
  localStorage.clear();
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

function open(target?: NostrEvent) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  renderWithRouter(<ReactionPickerDialog target={target} onPick={onPick} onClose={onClose} />);
  return { onPick, onClose, dialog: screen.getByRole("dialog", { name: "リアクション" }) };
}

function sectionTitles(): string[] {
  return screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
}

it("検索なしは「最近」→「カスタム絵文字」→ Unicode のカテゴリ", () => {
  open();
  expect(sectionTitles()).toEqual([
    "最近",
    "カスタム絵文字",
    "表情",
    "手・ジェスチャー",
    "ハート・感情",
    "動物・自然",
    "食べ物・飲み物",
    "アクティビティ・記号",
  ]);
  expect(
    within(screen.getByRole("region", { name: "最近" })).getByRole("button", { name: "🔥" }),
  ).toBeVisible();
});

it("検索すると「カスタム」「絵文字」に絞る。無ければ「一致する絵文字がありません」", async () => {
  const user = userEvent.setup();
  open();
  const search = screen.getByRole("searchbox", { name: "絵文字を検索" });

  await user.type(search, "cat");
  expect(
    within(screen.getByRole("region", { name: "カスタム" })).getByRole("button", { name: ":cat:" }),
  ).toBeVisible();

  await user.clear(search);
  await user.type(search, "わらい");
  expect(screen.queryByRole("region", { name: "カスタム" })).toBeNull();
  expect(
    within(screen.getByRole("region", { name: "絵文字" })).getByRole("button", { name: "😄" }),
  ).toBeVisible();

  await user.clear(search);
  await user.type(search, "zzzz");
  expect(screen.getByText("一致する絵文字がありません")).toBeVisible();
});

it("Unicode を選ぶと onPick(文字, null) して閉じる", async () => {
  const user = userEvent.setup();
  const { onPick, onClose } = open();
  await user.click(screen.getByRole("button", { name: "😄" }));
  expect(onPick).toHaveBeenCalledWith("😄", null);
  expect(onClose).toHaveBeenCalled();
});

it("カスタム絵文字を選ぶと onPick(:code:, 画像 URL)", async () => {
  const user = userEvent.setup();
  const { onPick } = open();
  const custom = within(screen.getByRole("region", { name: "カスタム絵文字" })).getByRole("button", {
    name: ":cat:",
  });
  expect(custom.querySelector("img")).not.toBeNull();
  await user.click(custom);
  expect(onPick).toHaveBeenCalledWith(":cat:", "https://e/cat.png");
});

it("対象があれば名前と本文を出す", async () => {
  const authorKey = generateSecretKey();
  eventStore.add(
    finalizeEvent(
      { kind: 0, created_at: unixNow(), tags: [], content: JSON.stringify({ name: "alice" }) },
      authorKey,
    ),
  );
  const target = finalizeEvent(
    { kind: 1, created_at: unixNow(), tags: [], content: "対象の本文" },
    authorKey,
  );
  open(target);
  expect(await screen.findByText("alice")).toBeVisible();
  expect(screen.getByText("対象の本文")).toBeVisible();
});

it("cancel（Esc / 戻る）・✗・背景の押下で onClose", async () => {
  const user = userEvent.setup();
  const { onClose, dialog } = open();
  act(() => {
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  });
  expect(onClose).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("button", { name: "閉じる" }));
  expect(onClose).toHaveBeenCalledTimes(2);

  await user.click(dialog);
  expect(onClose).toHaveBeenCalledTimes(3);
});
