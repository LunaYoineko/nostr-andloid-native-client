import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { decode, npubEncode, nsecEncode } from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setNip46PoolForTest } from "../signer/nip46";
import { LoginError, SESSION_FLAG_KEY, SESSION_KEY, useSession } from "../signer/session";
import { getKeyVault } from "../signer/webKeyVault";
import { installDialogPolyfill } from "../test/dialog";
import { FakeBunker } from "../test/fakeBunker";
import { installFakeNostr, installTestVault, PUBKEY, resetSession } from "../test/fakeNostr";
import { routes } from "./routes";

beforeAll(() => {
  installDialogPolyfill();
});

afterEach(() => {
  resetSession();
});

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { basename: "/app", initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

it("ログインに成功すると next へ戻り、設定に npub の短縮が出る", async () => {
  installFakeNostr();
  useSession.setState({ status: "out" });
  const router = renderAt("/app/login?next=%2Fsettings");

  await userEvent.click(screen.getByRole("button", { name: "拡張機能でログイン（NIP-07）" }));

  // プロフィール未取得なので名前も npub の短縮になる
  expect(await screen.findAllByText(`${npubEncode(PUBKEY).slice(0, 12)}…`)).not.toHaveLength(0);
  expect(router.state.location.pathname).toBe("/app/settings");
  expect(useSession.getState().status).toBe("in");
  expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
  expect(localStorage.getItem(SESSION_FLAG_KEY)).toBe("1");
});

it("拡張が拒否したらエラー文言を画面に出す", async () => {
  installFakeNostr({ reject: true });
  useSession.setState({ status: "out" });
  renderAt("/app/login");

  await userEvent.click(screen.getByRole("button", { name: "拡張機能でログイン（NIP-07）" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("許可されなかった");
  expect(useSession.getState().status).toBe("out");
});

it("拡張が無ければ nos2x / Alby / Nostash の案内を出す", async () => {
  useSession.setState({ status: "out" });
  renderAt("/app/login");

  const help = await screen.findByRole("region", { name: "拡張機能の案内" }, { timeout: 3000 });
  for (const name of ["nos2x", "Alby", "Nostash"]) {
    const link = screen.getByRole("link", { name });
    expect(help).toContainElement(link);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
});

it("ログアウトで localStorage が空になりゲートへ戻る", async () => {
  installFakeNostr();
  await useSession.getState().login();
  renderAt("/app/settings/account");

  await userEvent.click(await screen.findByRole("button", { name: "ログアウト" }));
  const dialog = screen.getByRole("dialog", { name: "ログアウトしますか？" });
  await userEvent.click(within(dialog).getByRole("button", { name: "ログアウト" }));

  expect(await screen.findByRole("button", { name: "拡張機能でログイン（NIP-07）" })).toBeInTheDocument();
  expect(localStorage.length).toBe(0);
  expect(useSession.getState().status).toBe("out");
});

describe("秘密鍵（nsec）", () => {
  function summary() {
    return screen.getByText("秘密鍵（nsec）でログイン", { selector: "summary" });
  }

  async function openNsecForm() {
    await userEvent.click(summary());
    return screen.getByLabelText("秘密鍵（nsec）");
  }

  it("並びは NIP-07 → 秘密鍵（閉じている）→ 新規生成", () => {
    useSession.setState({ status: "out" });
    renderAt("/app/login");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nostrism へようこそ");
    const nip07 = screen.getByRole("button", { name: "拡張機能でログイン（NIP-07）" });
    const newKey = screen.getByRole("button", { name: "新規生成" });
    expect(nip07.compareDocumentPosition(summary()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(summary().compareDocumentPosition(newKey) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((summary().parentElement as HTMLDetailsElement).open).toBe(false);
  });

  it("開くと警告とマスクした入力欄。「表示」「隠す」で切り替える", async () => {
    useSession.setState({ status: "out" });
    renderAt("/app/login");
    const input = await openNsecForm();

    expect(
      screen.getByText(/秘密鍵（nsec）を知っている人は、あなたのアカウントを完全に操作できます。/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Web 版では表示・書き出しはできません。/)).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");

    await userEvent.click(screen.getByRole("button", { name: "表示" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "隠す" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "隠す" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("nsec1 で始まらなければ入力の先頭を出す", async () => {
    await installTestVault();
    useSession.setState({ status: "out" });
    renderAt("/app/login");
    const input = await openNsecForm();

    await userEvent.type(input, "ab c");
    await userEvent.click(screen.getByRole("button", { name: "取り込み" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("（入力の先頭: abc）");
    expect(useSession.getState().status).toBe("out");
  });

  it("正しい nsec で取り込むと next へ戻り、nsec は DOM に残らない", async () => {
    const db = await installTestVault();
    useSession.setState({ status: "out" });
    const router = renderAt("/app/login?next=%2Fsettings");
    const input = await openNsecForm();
    const sk = generateSecretKey();
    const nsec = nsecEncode(sk);

    await userEvent.type(input, nsec);
    // 入力値は属性に出さない
    expect(document.body.innerHTML).not.toContain(nsec);
    await userEvent.click(screen.getByRole("button", { name: "取り込み" }));

    expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/app/settings");
    expect(useSession.getState()).toMatchObject({ status: "in", method: "local", pubkey: getPublicKey(sk) });
    expect(await db.vault.count()).toBe(1);
    expect(document.body.textContent).not.toContain(nsec);
    expect(document.body.innerHTML).not.toContain(nsec);
  });

  it("保管先が使えなければ、安全に保存できない旨を出す", async () => {
    useSession.setState({ status: "out" });
    renderAt("/app/login");
    const input = await openNsecForm();

    await userEvent.type(input, nsecEncode(generateSecretKey()));
    await userEvent.click(screen.getByRole("button", { name: "取り込み" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "このブラウザでは秘密鍵を安全に保存できません。拡張機能（NIP-07）でログインしてください。",
    );
    expect(useSession.getState().status).toBe("out");
    expect(localStorage.length).toBe(0);
  });
});

describe("新規生成", () => {
  it("確認 → 生成した nsec を 1 回だけ出し、「控えた」まで進めない → 進むと local でログイン", async () => {
    const user = userEvent.setup();
    const db = await installTestVault();
    useSession.setState({ status: "out" });
    const router = renderAt("/app/login?next=%2Fsettings");

    await user.click(screen.getByRole("button", { name: "新規生成" }));
    const dialog = screen.getByRole("dialog", { name: "新しい鍵を生成しますか？" });
    expect(dialog).toHaveTextContent("書き出しできない");
    await user.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useSession.getState().status).toBe("out");
    expect(await db.vault.count()).toBe(0);

    await user.click(screen.getByRole("button", { name: "新規生成" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "新しい鍵を生成しますか？" })).getByRole("button", {
        name: "生成する",
      }),
    );

    expect(await screen.findByRole("heading", { name: "秘密鍵を控えてください" })).toBeInTheDocument();
    expect(screen.getByText("控えてください。この画面を閉じると二度と表示されません。")).toBeInTheDocument();
    const stored = await getKeyVault().storedPubkey();
    const nsec = await getKeyVault().withPrivateKey((sk) => nsecEncode(sk));
    expect(screen.getByText(nsec)).toBeInTheDocument();
    expect(getPublicKey(decode(nsec).data as Uint8Array)).toBe(stored);
    // 控えを確認するまではログインしない
    expect(useSession.getState().status).toBe("out");
    expect(localStorage.length).toBe(0);

    await user.click(screen.getByRole("button", { name: "コピー" }));
    expect(await navigator.clipboard.readText()).toBe(nsec);
    expect(screen.getByRole("status")).toHaveTextContent("コピーしました");

    const next = screen.getByRole("button", { name: "次へ" });
    expect(next).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "秘密鍵（nsec）を控えた" }));
    expect(next).toBeEnabled();
    await user.click(next);

    expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/app/settings");
    expect(useSession.getState()).toMatchObject({ status: "in", method: "local", pubkey: stored });
    expect(document.body.textContent).not.toContain(nsec);
    expect(await db.vault.count()).toBe(1);
  });

  it("保管先が使えなければ、控えを出さずに安全に保存できない旨を出す", async () => {
    useSession.setState({ status: "out" });
    renderAt("/app/login");

    await userEvent.click(screen.getByRole("button", { name: "新規生成" }));
    await userEvent.click(screen.getByRole("button", { name: "生成する" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "このブラウザでは秘密鍵を安全に保存できません。",
    );
    expect(screen.queryByRole("heading", { name: "秘密鍵を控えてください" })).not.toBeInTheDocument();
    expect(useSession.getState().status).toBe("out");
  });
});

describe("リモート署名（NIP-46）", () => {
  const loginWithBunker = useSession.getState().loginWithBunker;
  let bunker: FakeBunker;

  beforeEach(() => {
    bunker = new FakeBunker();
    setNip46PoolForTest(bunker);
  });

  afterEach(() => {
    useSession.setState({ loginWithBunker });
  });

  function summary() {
    return screen.getByText("リモート署名でログイン（NIP-46）", { selector: "summary" });
  }

  async function openBunkerForm() {
    await userEvent.click(summary());
    return screen.getByLabelText("bunker:// を貼り付け");
  }

  it("並びは NIP-07 → リモート署名（閉じている）→ 秘密鍵", () => {
    useSession.setState({ status: "out" });
    renderAt("/app/login");

    const nip07 = screen.getByRole("button", { name: "拡張機能でログイン（NIP-07）" });
    const nsec = screen.getByText("秘密鍵（nsec）でログイン", { selector: "summary" });
    expect(nip07.compareDocumentPosition(summary()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(summary().compareDocumentPosition(nsec) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((summary().parentElement as HTMLDetailsElement).open).toBe(false);
  });

  it("bunker:// で始まらない入力では「接続」を押せない", async () => {
    useSession.setState({ status: "out" });
    renderAt("/app/login");
    const input = await openBunkerForm();

    expect(screen.getByText(/秘密鍵は署名アプリ側に残り、このブラウザには置きません。/)).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("autocomplete", "off");
    const connect = screen.getByRole("button", { name: "接続" });
    expect(connect).toBeDisabled();
    await userEvent.type(input, "nsec1abc");
    expect(connect).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, "bunker://x");
    expect(connect).toBeEnabled();
  });

  it("接続に成功すると next へ戻り、secret は DOM に残らない", async () => {
    await installTestVault();
    useSession.setState({ status: "out" });
    const router = renderAt("/app/login?next=%2Fsettings");
    const input = await openBunkerForm();
    const uri = bunker.uri({ secret: "very-secret-token" });

    await userEvent.type(input, uri);
    // 入力値は属性に出さない
    expect(document.body.innerHTML).not.toContain("very-secret-token");
    await userEvent.click(screen.getByRole("button", { name: "接続" }));

    expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/app/settings");
    expect(useSession.getState()).toMatchObject({ status: "in", method: "nip46", pubkey: bunker.user });
    expect(document.body.innerHTML).not.toContain("very-secret-token");
  });

  it("署名アプリに拒否されたら、その旨を出す", async () => {
    await installTestVault();
    bunker.replies.set("connect", { error: "denied by user" });
    useSession.setState({ status: "out" });
    renderAt("/app/login");
    const input = await openBunkerForm();

    await userEvent.type(input, bunker.uri());
    await userEvent.click(screen.getByRole("button", { name: "接続" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("署名アプリに拒否されました");
    expect(screen.getByRole("alert")).not.toHaveTextContent("denied by user");
    expect(useSession.getState().status).toBe("out");
  });

  it.each([
    ["invalid-uri", "bunker://… の形式で、wss:// のリレーを含む接続先を貼り付けてください"],
    ["timeout", "署名アプリから応答がありませんでした。アプリで承認してから、もう一度お試しください"],
    ["rejected", "署名アプリに拒否されました"],
    ["unavailable", "このブラウザでは接続情報を保存できません。拡張機能（NIP-07）でログインしてください。"],
  ] as const)("%s の文言", async (reason, message) => {
    useSession.setState({
      status: "out",
      loginWithBunker: async () => {
        throw new LoginError(reason);
      },
    });
    renderAt("/app/login");
    const input = await openBunkerForm();

    await userEvent.type(input, "bunker://x");
    await userEvent.click(screen.getByRole("button", { name: "接続" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("接続中は他のログイン方法を押せず、「やめる」で戻る（エラーは出さない）", async () => {
    await installTestVault();
    bunker.replies.set("connect", "silent");
    useSession.setState({ status: "out" });
    renderAt("/app/login");
    const input = await openBunkerForm();

    await userEvent.type(input, bunker.uri());
    await userEvent.click(screen.getByRole("button", { name: "接続" }));

    const connecting = await screen.findByRole("button", { name: "接続中…（署名アプリで承認してください）" });
    expect(connecting).toBeDisabled();
    expect(screen.getByRole("button", { name: "拡張機能でログイン（NIP-07）" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "新規生成" })).toBeDisabled();
    expect(input).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "やめる" }));

    expect(await screen.findByRole("button", { name: "接続" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "やめる" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拡張機能でログイン（NIP-07）" })).toBeEnabled();
    expect(useSession.getState().status).toBe("out");
    expect(bunker.openSubscriptions).toBe(0);
  });
});
