import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { EMPTY, throwError } from "rxjs";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { requestOnce, resetRelays } from "../../nostr/pool";
import { publishEvent } from "../../nostr/publish";
import { useSession } from "../../signer/session";
import { installDialogPolyfill } from "../../test/dialog";
import { useToast } from "../../ui/toast";
import { RelaySection } from "./RelaySection";

// リレーには繋がない（取り直しはテストごとに完了 / 失敗を返す）
vi.mock("../../nostr/pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/pool")>()),
  requestOnce: vi.fn(),
}));

// 署名・送信はしない
vi.mock("../../nostr/publish", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/publish")>()),
  publishEvent: vi.fn(async () => ({})),
}));

beforeAll(() => {
  installDialogPolyfill();
});

beforeEach(() => {
  // 既定リレー（en-US）= relay.damus.io / nos.lol の read + write で始まる
  localStorage.clear();
  resetRelays();
  useSession.setState({ status: "in", method: "nip07", pubkey: getPublicKey(generateSecretKey()) });
  vi.mocked(requestOnce).mockReset();
  vi.mocked(publishEvent).mockClear();
  useToast.setState({ queue: [] });
});

afterEach(() => {
  useSession.setState({ status: "loading", method: null, pubkey: null });
  resetRelays();
});

function rows() {
  return within(screen.getByRole("list", { name: "リレーの一覧" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent?.replace(/ReadWrite削除$/, ""));
}

async function addRelay(value: string) {
  const input = screen.getByRole("textbox", { name: "追加するリレーの URL" });
  await userEvent.clear(input);
  await userEvent.type(input, value);
  await userEvent.click(screen.getByRole("button", { name: "追加" }));
}

async function save() {
  await userEvent.click(screen.getByRole("button", { name: "保存" }));
  const dialog = screen.getByRole("dialog", { name: "リレーリストを公開しますか？" });
  await userEvent.click(within(dialog).getByRole("button", { name: "公開する" }));
}

it("wss:// だけ追加でき、削除・Read / Write の切り替えをして保存すると kind:10002 を発行する", async () => {
  vi.mocked(requestOnce).mockReturnValue(EMPTY);
  render(<RelaySection />);
  expect(rows()).toEqual(["relay.damus.io", "nos.lol"]);

  await addRelay("https://not-a-relay.example");
  expect(screen.getByRole("alert")).toHaveTextContent("wss:// で始まるリレーの URL を入力してください");
  await addRelay("wss://nos.lol");
  expect(screen.getByRole("alert")).toHaveTextContent("このリレーは追加済みです");
  await addRelay("wss://new.example");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(rows()).toEqual(["relay.damus.io", "nos.lol", "new.example"]);

  await userEvent.click(screen.getByRole("button", { name: "nos.lol を削除" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "relay.damus.io の Write" }));
  expect(rows()).toEqual(["relay.damus.io", "new.example"]);

  await save();

  expect(vi.mocked(publishEvent)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(publishEvent).mock.calls[0][0]).toMatchObject({
    kind: 10002,
    tags: [
      ["r", "wss://relay.damus.io", "read"],
      ["r", "wss://new.example"],
    ],
  });
  expect(useToast.getState().queue).toEqual(["リレーリストを公開しました"]);
});

it("保存の直前の取り直しでどのリレーからも応答が無ければ発行しない", async () => {
  vi.mocked(requestOnce).mockReturnValue(throwError(() => new Error("timeout")));
  render(<RelaySection />);
  await addRelay("wss://new.example");

  await save();

  expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  expect(useToast.getState().queue).toEqual([
    "最新のリレーリストを取得できなかったため、公開しませんでした。接続を確認してもう一度お試しください",
  ]);
  // 下書きは残る
  expect(rows()).toEqual(["relay.damus.io", "nos.lol", "new.example"]);
});

it("Read も Write も無ければ保存できない", async () => {
  render(<RelaySection />);
  await userEvent.click(screen.getByRole("button", { name: "relay.damus.io を削除" }));
  await userEvent.click(screen.getByRole("button", { name: "nos.lol を削除" }));
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
});
