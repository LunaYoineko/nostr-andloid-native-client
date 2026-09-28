import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { addVerified } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { installDialogPolyfill } from "../../test/dialog";
import { useToast } from "../../ui/toast";
import { USED_HASHTAGS_KEY } from "../compose/storage";
import { HashtagManager } from "./HashtagManager";
import { PinnedHashtagsError, publishPinnedHashtags } from "./pinnedHashtags";

// 取り直し・発行は pinnedHashtags.test.ts。ここは呼び出しと画面だけ
vi.mock("./pinnedHashtags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pinnedHashtags")>()),
  publishPinnedHashtags: vi.fn(async () => undefined),
}));

let meKey: Uint8Array;
let me: string;

beforeAll(() => {
  installDialogPolyfill();
});

beforeEach(() => {
  meKey = generateSecretKey();
  me = getPublicKey(meKey);
  useSession.setState({ status: "in", method: "local", pubkey: me });
  vi.mocked(publishPinnedHashtags).mockReset();
  vi.mocked(publishPinnedHashtags).mockResolvedValue(undefined);
});

afterEach(() => {
  localStorage.clear();
  useSession.setState({ status: "loading", method: null, pubkey: null });
  useToast.setState({ queue: [] });
});

function pinnedList(tags: string[]) {
  return finalizeEvent(
    { kind: 30015, created_at: 1_000, tags: [["d", "pinned"], ...tags.map((t) => ["t", t])], content: "" },
    meKey,
  );
}

function pinnedRows() {
  return within(screen.getByRole("list", { name: "ピン留めの一覧" }))
    .getAllByRole("listitem")
    .map((li) => within(li).getByText(/^#/).textContent);
}

it("ピン留めが無ければ案内を出し、保存は無効", () => {
  render(<HashtagManager onDismiss={vi.fn()} />);
  expect(
    screen.getByText(
      "ピン留めはまだありません。下から追加するか、使ったことのあるタグをピン留めしてください。",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
});

it("追加の検証（不正な文字・重複・上限）、↑↓ で並べ替えて保存すると新しい順で発行する", async () => {
  addVerified(pinnedList(["nostr", "zap"]));
  render(<HashtagManager onDismiss={vi.fn()} />);
  expect(pinnedRows()).toEqual(["#nostr", "#zap"]);

  const input = screen.getByRole("textbox", { name: "タグを追加" });
  await userEvent.type(input, "a b");
  await userEvent.click(screen.getByRole("button", { name: "追加" }));
  expect(screen.getByRole("alert")).toHaveTextContent("タグに使えるのは文字・数字・_ だけです。");

  await userEvent.clear(input);
  await userEvent.type(input, "#Nostr");
  await userEvent.click(screen.getByRole("button", { name: "追加" }));
  expect(screen.getByRole("alert")).toHaveTextContent("そのタグはすでにピン留めされています。");

  await userEvent.clear(input);
  await userEvent.type(input, "bitcoin");
  await userEvent.click(screen.getByRole("button", { name: "追加" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(pinnedRows()).toEqual(["#nostr", "#zap", "#bitcoin"]);

  // zap（index 1）を先頭へ
  await userEvent.click(screen.getByRole("button", { name: "#zap を上へ移動" }));
  expect(pinnedRows()).toEqual(["#zap", "#nostr", "#bitcoin"]);

  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(vi.mocked(publishPinnedHashtags)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(publishPinnedHashtags).mock.calls[0]).toEqual([
    me,
    ["zap", "nostr", "bitcoin"],
    expect.any(String),
  ]);
  expect(useToast.getState().queue).toEqual(["ピン留めを保存しました"]);
});

it("上限 15 件ではそれ以上追加できない", async () => {
  addVerified(pinnedList(Array.from({ length: 15 }, (_, i) => `t${i}`)));
  render(<HashtagManager onDismiss={vi.fn()} />);

  const input = screen.getByRole("textbox", { name: "タグを追加" });
  await userEvent.type(input, "new");
  await userEvent.click(screen.getByRole("button", { name: "追加" }));

  expect(screen.getByRole("alert")).toHaveTextContent("ピン留めは15件までです。整理画面で整理してください。");
  expect(vi.mocked(publishPinnedHashtags)).not.toHaveBeenCalled();
});

it("削除は下書きから外れ、保存すると反映される", async () => {
  addVerified(pinnedList(["nostr", "zap"]));
  render(<HashtagManager onDismiss={vi.fn()} />);

  await userEvent.click(screen.getByRole("button", { name: "#nostr を外す" }));
  expect(pinnedRows()).toEqual(["#zap"]);

  await userEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(vi.mocked(publishPinnedHashtags).mock.calls[0][1]).toEqual(["zap"]);
});

it("保存が stale なら下書きを捨てて最新の内容を出し直す", async () => {
  addVerified(pinnedList(["nostr"]));
  vi.mocked(publishPinnedHashtags).mockRejectedValueOnce(new PinnedHashtagsError("stale"));
  render(<HashtagManager onDismiss={vi.fn()} />);

  const input = screen.getByRole("textbox", { name: "タグを追加" });
  await userEvent.type(input, "zap");
  await userEvent.click(screen.getByRole("button", { name: "追加" }));
  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  await vi.waitFor(() =>
    expect(useToast.getState().queue).toEqual([
      "ピン留めが更新されていたため、保存しませんでした。最新の内容を表示したので、確認してもう一度編集してください",
    ]),
  );
  expect(pinnedRows()).toEqual(["#nostr"]);
});

it("使ったことのあるタグ: 絞り込み・ピン留め・履歴から削除（発行しない）", async () => {
  localStorage.setItem(
    USED_HASHTAGS_KEY,
    JSON.stringify([
      { tag: "nostr", lastUsed: 2 },
      { tag: "bitcoin", lastUsed: 1 },
    ]),
  );
  addVerified(pinnedList(["nostr"]));
  render(<HashtagManager onDismiss={vi.fn()} />);

  const usedSection = screen.getByRole("region", { name: "使ったことのあるタグ" });
  // 既にピン留め済みのものはバッジで、ピン留めボタンは出さない
  expect(within(usedSection).getByText("ピン留め中")).toBeInTheDocument();
  expect(within(usedSection).queryByRole("button", { name: "ピン留め" })).toBeInTheDocument();

  await userEvent.type(screen.getByRole("textbox", { name: "使ったことのあるタグを絞り込み" }), "bit");
  expect(within(usedSection).getByText("#bitcoin")).toBeInTheDocument();
  expect(within(usedSection).queryByText("#nostr")).not.toBeInTheDocument();

  await userEvent.click(within(usedSection).getByRole("button", { name: "ピン留め" }));
  expect(pinnedRows()).toEqual(["#nostr", "#bitcoin"]);

  await userEvent.click(screen.getByRole("button", { name: "#bitcoin を履歴から削除" }));
  expect(vi.mocked(publishPinnedHashtags)).not.toHaveBeenCalled();
  expect(useToast.getState().queue).toEqual(["履歴から削除しました"]);
});

it("変更したまま閉じると確認、破棄すると閉じる。変更が無ければそのまま閉じる", async () => {
  addVerified(pinnedList(["nostr"]));
  const onDismiss = vi.fn();
  render(<HashtagManager onDismiss={onDismiss} />);

  await userEvent.click(screen.getByRole("button", { name: "#nostr を外す" }));
  await userEvent.click(screen.getByRole("button", { name: "閉じる" }));

  const confirm = screen.getByRole("dialog", { name: "変更を破棄しますか？" });
  expect(onDismiss).not.toHaveBeenCalled();
  await userEvent.click(within(confirm).getByRole("button", { name: "破棄する" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

it("変更が無ければ閉じるボタンで確認なしに閉じる", async () => {
  addVerified(pinnedList(["nostr"]));
  const onDismiss = vi.fn();
  render(<HashtagManager onDismiss={onDismiss} />);

  await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog", { name: "変更を破棄しますか？" })).toBeNull();
});
