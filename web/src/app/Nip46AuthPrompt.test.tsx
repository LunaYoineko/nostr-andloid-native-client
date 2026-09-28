import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { connectBunker, setNip46PoolForTest, useNip46Auth } from "../signer/nip46";
import { installDialogPolyfill } from "../test/dialog";
import { FakeBunker } from "../test/fakeBunker";
import { installTestVault, resetSession } from "../test/fakeNostr";
import { Nip46AuthPrompt } from "./Nip46AuthPrompt";

const AUTH_URL = "https://signer.example/approve?token=abc";
let bunker: FakeBunker;

beforeAll(() => {
  installDialogPolyfill();
});

beforeEach(() => {
  bunker = new FakeBunker();
  setNip46PoolForTest(bunker);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetSession();
});

it("auth_url（https）で確認を出し、「承認ページを開く」で noopener,noreferrer で開く", async () => {
  await installTestVault();
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  bunker.replies.set("connect", { authUrl: AUTH_URL, after: { result: "ack" } });
  render(<Nip46AuthPrompt />);

  await connectBunker(bunker.uri());

  const dialog = await screen.findByRole("dialog", { name: "署名アプリでの承認が必要です" });
  expect(dialog).toHaveTextContent("開いたページで承認すると、処理が続きます。");
  expect(dialog).toHaveTextContent("signer.example");
  // 自動では開かない（ポップアップを止められる）
  expect(open).not.toHaveBeenCalled();

  await userEvent.click(within(dialog).getByRole("button", { name: "承認ページを開く" }));

  expect(open).toHaveBeenCalledWith(AUTH_URL, "_blank", "noopener,noreferrer");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(useNip46Auth.getState().url).toBeNull();
});

it("「閉じる」では開かずに消す", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  useNip46Auth.setState({ url: AUTH_URL });
  render(<Nip46AuthPrompt />);

  await userEvent.click(screen.getByRole("button", { name: "閉じる" }));

  expect(open).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(useNip46Auth.getState().url).toBeNull();
});

it("https 以外の auth_url は出さず、その要求は失敗する", async () => {
  await installTestVault();
  bunker.replies.set("connect", { authUrl: "http://signer.example/approve" });
  render(<Nip46AuthPrompt />);

  await expect(connectBunker(bunker.uri())).rejects.toMatchObject({ reason: "rejected" });

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
