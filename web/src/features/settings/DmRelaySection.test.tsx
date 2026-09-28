import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { of } from "rxjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetRelays, useRelays } from "../../nostr/pool";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { useToast } from "../../ui/toast";
import { DmRelaySection } from "./DmRelaySection";
import { DmRelayListError, publishDmRelayList } from "./dmRelayList";
import { dmRelayRecs$ } from "./dmRelayRecs";

// 取り直し・発行は dmRelayList.test.ts。ここは呼び出しと画面だけ
vi.mock("./dmRelayList", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./dmRelayList")>()),
  publishDmRelayList: vi.fn(async () => {}),
}));

// 集計は dmRelayRecs.test.ts。ここは常に同じ 1 件を返す
vi.mock("./dmRelayRecs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./dmRelayRecs")>()),
  dmRelayRecs$: vi.fn(() => of([{ url: "wss://rec.example/", count: 5 }])),
}));

let key: Uint8Array;
let me: string;

beforeEach(() => {
  key = generateSecretKey();
  me = getPublicKey(key);
  useSession.setState({ status: "in", method: "local", pubkey: me });
  vi.mocked(publishDmRelayList).mockClear();
  vi.mocked(publishDmRelayList).mockResolvedValue();
  vi.mocked(dmRelayRecs$).mockClear();
  useToast.setState({ queue: [] });
  resetRelays();
});

afterEach(() => {
  useSession.setState({ status: "loading", method: null, pubkey: null });
  resetRelays();
});

/** 自分の kind:10050 を EventStore に入れておく（画面が最初に見る版） */
function seed(urls: string[], createdAt = 1_000) {
  const event = finalizeEvent(
    { kind: 10050, created_at: createdAt, tags: urls.map((u) => ["relay", u]), content: "" },
    key,
  );
  eventStore.add(event);
  return event;
}

async function addRelay(value: string) {
  const input = screen.getByRole("textbox", { name: "追加するDMリレーの URL" });
  await userEvent.clear(input);
  await userEvent.type(input, value);
  await userEvent.click(screen.getByRole("button", { name: "追加" }));
}

it("未設定なら案内を出し、追加すると表示している版の id を付けて 1 回発行してトーストを出す", async () => {
  render(<DmRelaySection />);
  expect(screen.getByText("未設定です。")).toBeInTheDocument();

  await addRelay("wss://new.example");

  expect(vi.mocked(publishDmRelayList)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(publishDmRelayList)).toHaveBeenCalledWith(me, ["wss://new.example/"], null);
  expect(useToast.getState().queue).toEqual(["DMリレーを公開しました"]);
});

it("削除すると、残りの一覧と表示している版の id を付けて 1 回発行する", async () => {
  const latest = seed(["wss://a.example", "wss://b.example"]);
  render(<DmRelaySection />);

  await userEvent.click(screen.getByRole("button", { name: "b.example を削除" }));

  expect(vi.mocked(publishDmRelayList)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(publishDmRelayList)).toHaveBeenCalledWith(me, ["wss://a.example/"], latest.id);
});

it("現在の受信リレーから作成すると、read リレーの先頭 4 件で発行する", async () => {
  useRelays.setState({
    read: [
      "wss://r1.example",
      "wss://r2.example",
      "wss://r3.example",
      "wss://r4.example",
      "wss://r5.example",
    ],
  });
  render(<DmRelaySection />);

  await userEvent.click(screen.getByRole("button", { name: "現在の受信リレーから作成" }));

  expect(vi.mocked(publishDmRelayList)).toHaveBeenCalledWith(
    me,
    ["wss://r1.example/", "wss://r2.example/", "wss://r3.example/", "wss://r4.example/"],
    null,
  );
});

it("候補から追加すると、その場で発行する", async () => {
  seed(["wss://a.example"]);
  render(<DmRelaySection />);

  await userEvent.click(screen.getByRole("button", { name: "▼ 候補から追加（おすすめ）" }));
  const rec = await screen.findByRole("button", { name: "rec.example を追加（5人）" });
  await userEvent.click(rec);

  expect(vi.mocked(publishDmRelayList)).toHaveBeenCalledWith(
    me,
    ["wss://a.example/", "wss://rec.example/"],
    expect.any(String),
  );
});

it("発行の直前の取り直しでどのリレーからも応答が無ければ発行せず、トーストを出す（一覧は変わらない）", async () => {
  seed(["wss://a.example"]);
  vi.mocked(publishDmRelayList).mockRejectedValueOnce(new DmRelayListError("no-relay-list"));
  render(<DmRelaySection />);

  await addRelay("wss://new.example");

  expect(useToast.getState().queue).toEqual([
    "最新のDMリレーを取得できなかったため、公開しませんでした。接続を確認してもう一度お試しください",
  ]);
  expect(screen.getByText("a.example")).toBeInTheDocument();
  expect(screen.queryByText("new.example")).not.toBeInTheDocument();
});

it("表示している版と取り直した最新版が違えば発行せず、トーストを出す", async () => {
  seed(["wss://a.example"]);
  vi.mocked(publishDmRelayList).mockRejectedValueOnce(new DmRelayListError("stale"));
  render(<DmRelaySection />);

  await addRelay("wss://new.example");

  expect(useToast.getState().queue).toEqual([
    "DMリレーが更新されていたため、公開しませんでした。最新の内容を表示したので、確認してもう一度操作してください",
  ]);
});

it("発行中は多重に送信しない（ボタンを無効にする）", async () => {
  seed(["wss://a.example"]);
  let resolvePublish!: () => void;
  vi.mocked(publishDmRelayList).mockReturnValueOnce(
    new Promise((resolve) => {
      resolvePublish = () => resolve();
    }),
  );
  render(<DmRelaySection />);

  // 追加ボタンは空欄だと常に無効なので、busy による無効化を見るために入力しておく
  await userEvent.type(screen.getByRole("textbox", { name: "追加するDMリレーの URL" }), "wss://new.example");
  const addButton = screen.getByRole("button", { name: "追加" });
  const deleteButton = screen.getByRole("button", { name: "a.example を削除" });

  await userEvent.click(deleteButton);
  expect(deleteButton).toBeDisabled();
  expect(addButton).toBeDisabled();

  resolvePublish();
  await waitFor(() => expect(addButton).not.toBeDisabled());
  expect(deleteButton).not.toBeDisabled();
  expect(vi.mocked(publishDmRelayList)).toHaveBeenCalledTimes(1);
});
