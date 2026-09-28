import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { beforeAll, expect, it, vi } from "vitest";
import { eventStore } from "../nostr/store";
import { installDialogPolyfill } from "../test/dialog";
import { EventJsonDialog, prettyEventJson, referencedEvents } from "./EventJsonDialog";

beforeAll(() => {
  installDialogPolyfill();
});

const A = "a".repeat(64);
const B = "b".repeat(64);

it("referencedEvents は e / q タグの ID を出現順・重複なしで（e のマーカーは e:reply の形）", () => {
  const event = finalizeEvent(
    {
      kind: 1,
      created_at: 1_000,
      tags: [
        ["e", A, "wss://hint.example", "root"],
        ["q", B],
        ["e", A, "", "reply"],
        ["q", "30023:abcd:slug"],
        ["p", A],
      ],
      content: "",
    },
    generateSecretKey(),
  );
  expect(referencedEvents(event)).toEqual([
    { label: "e:root", pointer: { id: A, relays: ["wss://hint.example"] } },
    { label: "q", pointer: { id: B, relays: [] } },
  ]);
});

it("参照先を押すとその JSON へ潜り、「←」で戻る。閉じると onDismiss", async () => {
  const target = finalizeEvent(
    { kind: 1, created_at: 900, tags: [], content: "返信先" },
    generateSecretKey(),
  );
  eventStore.add(target);
  const reply = finalizeEvent(
    { kind: 1, created_at: 1_000, tags: [["e", target.id, "", "reply"]], content: "返信" },
    generateSecretKey(),
  );
  const onDismiss = vi.fn();
  render(<EventJsonDialog event={reply} onDismiss={onDismiss} />);
  const dialog = screen.getByRole("dialog", { name: "イベントJSON" });
  expect(dialog.querySelector("pre")?.textContent).toBe(prettyEventJson(reply));
  expect(within(dialog).getByText("参照先イベント")).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "戻る" })).toBeNull();

  await userEvent.click(within(dialog).getByRole("button", { name: `e:reply ${target.id.slice(0, 16)}…` }));
  expect(dialog.querySelector("pre")?.textContent).toBe(prettyEventJson(target));
  expect(within(dialog).queryByText("参照先イベント")).toBeNull();

  await userEvent.click(within(dialog).getByRole("button", { name: "戻る" }));
  expect(dialog.querySelector("pre")?.textContent).toBe(prettyEventJson(reply));

  await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

it("手元に無い参照先は届くまで「イベントを取得中…」で、コピーは押せない", async () => {
  const quote = finalizeEvent(
    { kind: 1, created_at: 1_000, tags: [["q", "c".repeat(64)]], content: "引用" },
    generateSecretKey(),
  );
  render(<EventJsonDialog event={quote} onDismiss={() => {}} />);
  const dialog = screen.getByRole("dialog", { name: "イベントJSON" });
  await userEvent.click(within(dialog).getByRole("button", { name: `q ${"c".repeat(16)}…` }));
  expect(within(dialog).getByText("イベントを取得中…")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "テキストをコピー" })).toBeDisabled();
});
