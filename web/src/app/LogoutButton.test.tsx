import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { nsecEncode } from "nostr-tools/nip19";
import { generateSecretKey } from "nostr-tools/pure";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { useSession } from "../signer/session";
import { installDialogPolyfill } from "../test/dialog";
import { installTestVault, PUBKEY, resetSession } from "../test/fakeNostr";
import { LogoutButton } from "./LogoutButton";

beforeAll(() => {
  installDialogPolyfill();
});

afterEach(() => {
  resetSession();
});

function dialog() {
  return screen.getByRole("dialog", { name: "ログアウトしますか？" });
}

it("local では書き出せない旨を確認し、キャンセルならログインしたまま、ログアウトで out と鍵の削除", async () => {
  const db = await installTestVault();
  await useSession.getState().loginWithNsec(nsecEncode(generateSecretKey()));
  render(<LogoutButton />);

  await userEvent.click(screen.getByRole("button", { name: "ログアウト" }));
  expect(dialog()).toHaveTextContent("書き出せない");
  await userEvent.click(within(dialog()).getByRole("button", { name: "キャンセル" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(useSession.getState().status).toBe("in");

  await userEvent.click(screen.getByRole("button", { name: "ログアウト" }));
  await userEvent.click(within(dialog()).getByRole("button", { name: "ログアウト" }));
  expect(useSession.getState().status).toBe("out");
  expect(localStorage.length).toBe(0);
  await vi.waitFor(async () => expect(await db.vault.count()).toBe(0));
});

it("NIP-07 では秘密鍵が拡張機能に残る旨を出す", async () => {
  useSession.setState({ status: "in", method: "nip07", pubkey: PUBKEY });
  render(<LogoutButton />);

  await userEvent.click(screen.getByRole("button", { name: "ログアウト" }));
  expect(dialog()).toHaveAccessibleDescription(
    "この端末のログイン情報を削除します。秘密鍵は拡張機能に残ります。",
  );
});

it("NIP-46 では署名アプリとの接続を削除し、秘密鍵は署名アプリに残る旨を出す", async () => {
  useSession.setState({ status: "in", method: "nip46", pubkey: PUBKEY });
  render(<LogoutButton />);

  await userEvent.click(screen.getByRole("button", { name: "ログアウト" }));
  expect(dialog()).toHaveAccessibleDescription(
    "この端末のログイン情報（署名アプリとの接続）を削除します。秘密鍵は署名アプリに残ります。",
  );
});
