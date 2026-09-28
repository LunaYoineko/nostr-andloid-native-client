import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { EMPTY, throwError } from "rxjs";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requestOnce, resetRelays } from "../../nostr/pool";
import { publishEvent } from "../../nostr/publish";
import { AUTH_POLICY_KEY, setAuthPolicy } from "../../nostr/relayAuth";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { installDialogPolyfill } from "../../test/dialog";
import { renderWithRouter } from "../../test/renderWithRouter";
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
  renderWithRouter(<RelaySection />);
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
  renderWithRouter(<RelaySection />);
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
  renderWithRouter(<RelaySection />);
  await userEvent.click(screen.getByRole("button", { name: "relay.damus.io を削除" }));
  await userEvent.click(screen.getByRole("button", { name: "nos.lol を削除" }));
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
});

it("AUTH（NIP-42）への応答は 3 択で、既定は DM/自分のリレーのみ。選ぶと保存する", async () => {
  renderWithRouter(<RelaySection />);
  expect(screen.getByRole("button", { name: "DM/自分のリレーのみ" })).toHaveAttribute("aria-pressed", "true");

  await userEvent.click(screen.getByRole("button", { name: "無効" }));
  expect(screen.getByRole("button", { name: "無効" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "DM/自分のリレーのみ" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(localStorage.getItem(AUTH_POLICY_KEY)).toBe("off");

  await userEvent.click(screen.getByRole("button", { name: "常に応答" }));
  expect(localStorage.getItem(AUTH_POLICY_KEY)).toBe("always");
  setAuthPolicy("dm");
});

describe("候補から追加（おすすめ）", () => {
  it("開くとフォロー中の kind:10002 を集計して多い順に件数つきで出し、押すと下書きに read + write で入る（発行しない）", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    const meKey = generateSecretKey();
    useSession.setState({ status: "in", method: "nip07", pubkey: getPublicKey(meKey) });
    const followKeys = [generateSecretKey(), generateSecretKey(), generateSecretKey()];
    eventStore.add(
      finalizeEvent(
        { kind: 3, created_at: 1_000, tags: followKeys.map((k) => ["p", getPublicKey(k)]), content: "" },
        meKey,
      ),
    );
    const lists = [
      ["wss://popular.example", "wss://nos.lol", "wss://second.example"],
      ["wss://popular.example", "wss://second.example"],
      ["wss://popular.example"],
    ];
    followKeys.forEach((key, i) => {
      eventStore.add(
        finalizeEvent(
          { kind: 10002, created_at: 1_000, tags: lists[i].map((url) => ["r", url]), content: "" },
          key,
        ),
      );
    });
    renderWithRouter(<RelaySection />);

    await userEvent.click(screen.getByRole("button", { name: "▼ 候補から追加（おすすめ）" }));
    const recs = await screen.findByRole("list", { name: "おすすめのリレー" });
    // 登録済み（nos.lol）は出さない
    expect(
      within(recs)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["＋popular.example3人", "＋second.example2人"]);
    expect(screen.getByText("フォロー中でよく使われているリレー")).toBeInTheDocument();

    await userEvent.click(within(recs).getByRole("button", { name: "second.example を追加（2人）" }));
    expect(rows()).toEqual(["relay.damus.io", "nos.lol", "second.example"]);
    expect(screen.getByRole("checkbox", { name: "second.example の Read" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "second.example の Write" })).toBeChecked();
    // 足したものは候補から消える
    expect(
      within(recs)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["＋popular.example3人"]);
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "▲ 候補を閉じる" }));
    expect(screen.queryByRole("list", { name: "おすすめのリレー" })).toBeNull();
  });

  it("集計できない（フォローが無い）ときは定番の候補を出し、押すと下書きに入る（発行しない）", async () => {
    vi.mocked(requestOnce).mockReturnValue(EMPTY);
    renderWithRouter(<RelaySection />);

    await userEvent.click(screen.getByRole("button", { name: "▼ 候補から追加（おすすめ）" }));
    expect(
      await screen.findByText("集計できませんでした（フォローが無い等）。定番の候補:"),
    ).toBeInTheDocument();
    const general = screen.getByRole("list", { name: "定番の候補（汎用）" });
    // 登録済み（relay.damus.io / nos.lol）は出さない
    expect(within(general).queryByRole("button", { name: /^relay\.damus\.io / })).toBeNull();
    expect(
      within(general).getByRole("button", { name: "relay.nostr.band を追加（検索対応）" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "定番の候補（日本）" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "nostr.wine を追加（有料）" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "yabu.me を追加" }));
    expect(rows()).toEqual(["relay.damus.io", "nos.lol", "yabu.me"]);
    expect(vi.mocked(publishEvent)).not.toHaveBeenCalled();
  });
});
