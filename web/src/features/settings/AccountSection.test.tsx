import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { afterEach, beforeAll, expect, it } from "vitest";
import { createPasskeyVault, getPasskeyVault, setPasskeyVaultForTest } from "../../signer/passkeyVault";
import { useSession } from "../../signer/session";
import { createKeyVault } from "../../signer/webKeyVault";
import { installDialogPolyfill } from "../../test/dialog";
import { installTestVault, resetSession } from "../../test/fakeNostr";
import { AccountSection } from "./AccountSection";

beforeAll(() => {
  installDialogPolyfill();
});

afterEach(() => {
  resetSession();
  delete (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;
});

/** navigator.credentials の最小限のフェイク。create/get とも同じ credentialId・PRF を返す(同じパスキー) */
function fakePasskeyCredentials() {
  const prf: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(32));
  const rawId: Uint8Array<ArrayBuffer> = new Uint8Array([1, 2, 3, 4]);
  return {
    async create() {
      return { rawId: rawId.buffer, getClientExtensionResults: () => ({}) };
    },
    async get() {
      return {
        rawId: rawId.buffer,
        getClientExtensionResults: () => ({ prf: { results: { first: prf.buffer } } }),
      };
    },
  };
}

/** isPasskeySupported() が true になるようにする（getClientCapabilities は無い体） */
function markSupported() {
  (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = {};
}

it("PRF 非対応(getClientCapabilities が false)なら項目自体を出さない", async () => {
  await installTestVault();
  useSession.setState({ status: "in", method: "local", pubkey: getPublicKey(generateSecretKey()) });
  (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = {
    getClientCapabilities: async () => ({ "extension:prf": false }),
  };
  render(<AccountSection />);

  expect(await screen.findByText("公開鍵（npub）")).toBeInTheDocument();
  expect(screen.queryByText("パスキーで保護（Nosskey）")).not.toBeInTheDocument();
});

it("ローカル鍵以外では「ローカル鍵のときに設定できます」と出す", async () => {
  await installTestVault();
  useSession.setState({ status: "in", method: "nip07", pubkey: getPublicKey(generateSecretKey()) });
  markSupported();
  render(<AccountSection />);

  expect(await screen.findByText("パスキーで保護（Nosskey）")).toBeInTheDocument();
  expect(screen.getByText("ローカル鍵のときにパスキー保護を設定できます。")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "パスキーで保護する" })).not.toBeInTheDocument();
});

it("[条件4] ローカル鍵では確認ダイアログを経由して登録し、成功すると保護中(解錠済み)の表示になる", async () => {
  const db = await installTestVault();
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const localVault = createKeyVault({ database: async () => db });
  await localVault.importPrivateKey(sk);
  setPasskeyVaultForTest(
    createPasskeyVault({
      database: async () => db,
      localVault: () => localVault,
      credentials: () => fakePasskeyCredentials(),
      rpId: () => "test.example",
    }),
  );
  useSession.setState({ status: "in", method: "local", pubkey });
  markSupported();
  const user = userEvent.setup();
  render(<AccountSection />);

  await user.click(await screen.findByRole("button", { name: "パスキーで保護する" }));
  const dialog = screen.getByRole("dialog", { name: "パスキーで保護（Nosskey）" });
  expect(dialog).toHaveTextContent("nsec を控えてから保護してください。");
  await user.click(within(dialog).getByRole("button", { name: "パスキーで保護する" }));

  expect(await screen.findByText("● パスキーで保護中（解錠済み）")).toBeInTheDocument();
  expect(getPasskeyVault().isProtected()).toBe(true);
  expect(getPasskeyVault().isUnlocked()).toBe(true);
});

it("保護中(未解錠)は「パスキーで解錠」を押すと解錠済みの表示になる", async () => {
  const db = await installTestVault();
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const localVault = createKeyVault({ database: async () => db });
  await localVault.importPrivateKey(sk);
  const creds = fakePasskeyCredentials();
  const enrollVault = createPasskeyVault({
    database: async () => db,
    localVault: () => localVault,
    credentials: () => creds,
    rpId: () => "test.example",
  });
  await enrollVault.enroll();
  // 起動し直した想定の未解錠インスタンス
  setPasskeyVaultForTest(
    createPasskeyVault({ database: async () => db, credentials: () => creds, rpId: () => "test.example" }),
  );
  useSession.setState({ status: "in", method: "local", pubkey });
  markSupported();
  const user = userEvent.setup();
  render(<AccountSection />);

  expect(await screen.findByText("● パスキーで保護中（未解錠）")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "パスキーで解錠" }));

  expect(await screen.findByText("● パスキーで保護中（解錠済み）")).toBeInTheDocument();
});
