import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { shortNpub } from "../../lib/npub";
import { useSession } from "../../signer/session";
import { useToast } from "../../ui/toast";
import { EMPTY_MUTE_LIST, type MuteList, setMuteList } from "../mute/muteList";
import { addMuteWord, MuteListError, removeMuteEntry } from "../mute/muteSync";
import { MuteSection } from "./MuteSection";

// 取り直し・発行は muteSync.test.ts。ここは呼び出しと画面だけ
vi.mock("../mute/muteSync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../mute/muteSync")>()),
  addMuteWord: vi.fn(async () => "done" as const),
  removeMuteEntry: vi.fn(async () => "done" as const),
}));

const me = getPublicKey(generateSecretKey());
const muted = getPublicKey(generateSecretKey());

const LIST: MuteList = {
  ...EMPTY_MUTE_LIST,
  eventId: "shown-version",
  createdAt: 1_000,
  entries: [
    { category: "p", value: muted, isPublic: false, isPrivate: true },
    { category: "word", value: "Spam", isPublic: true, isPrivate: true },
    { category: "t", value: "nsfw", isPublic: true, isPrivate: false },
  ],
};

beforeEach(() => {
  useSession.setState({ status: "in", method: "local", pubkey: me });
  vi.mocked(addMuteWord).mockClear();
  vi.mocked(removeMuteEntry).mockClear();
});

afterEach(() => {
  setMuteList(null);
  useToast.setState({ queue: [] });
  useSession.setState({ status: "loading", method: null, pubkey: null });
});

it("読み込み中 → 空 → 種別ごとの一覧（件数・公開 / 非公開）", () => {
  render(<MuteSection />);
  expect(screen.getByRole("status")).toHaveTextContent("リレーから取得中…");
  expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();

  act(() => setMuteList(EMPTY_MUTE_LIST));
  expect(screen.getByText("ミュートしている項目はありません")).toBeInTheDocument();

  act(() => setMuteList(LIST));
  const users = screen.getByRole("region", { name: "ユーザー" });
  expect(within(users).getByRole("heading", { name: "ユーザー (1)" })).toBeInTheDocument();
  expect(within(users).getAllByText(shortNpub(muted)).length).toBeGreaterThan(0);
  expect(within(users).getByText("非公開")).toBeInTheDocument();
  const words = screen.getByRole("region", { name: "ワード" });
  expect(within(words).getByText("公開・非公開")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "ハッシュタグ" })).toHaveTextContent("#nsfw");
  expect(screen.queryByRole("region", { name: "スレッド" })).toBeNull();
});

it("解除・削除・追加は表示している版の id を付けて呼び、トーストを出す", async () => {
  const user = userEvent.setup();
  setMuteList(LIST);
  render(<MuteSection />);

  await user.click(screen.getByRole("button", { name: `${shortNpub(muted)} のミュートを解除` }));
  expect(removeMuteEntry).toHaveBeenCalledWith(me, "p", muted, "shown-version");
  await waitFor(() => expect(useToast.getState().queue).toEqual(["ミュートを解除しました"]));

  await user.click(screen.getByRole("button", { name: "Spam を削除" }));
  expect(removeMuteEntry).toHaveBeenCalledWith(me, "word", "Spam", "shown-version");

  // 大文字小文字を無視して追加済みなら呼ばない
  const input = screen.getByRole("textbox", { name: "ミュートするワード" });
  await user.type(input, "spam");
  await user.click(screen.getByRole("button", { name: "追加" }));
  expect(screen.getByRole("alert")).toHaveTextContent("このワードは追加済みです");
  expect(addMuteWord).not.toHaveBeenCalled();

  await user.clear(input);
  await user.type(input, " /^buy/ ");
  await user.click(screen.getByRole("button", { name: "追加" }));
  expect(addMuteWord).toHaveBeenCalledWith(me, "/^buy/", "shown-version");
  await waitFor(() => expect(useToast.getState().queue).toContain("ミュートワードを追加しました"));
});

it("最新版と食い違っていたら、その旨をトーストで出す", async () => {
  const user = userEvent.setup();
  vi.mocked(removeMuteEntry).mockRejectedValueOnce(new MuteListError("stale"));
  setMuteList(LIST);
  render(<MuteSection />);
  await user.click(screen.getByRole("button", { name: "#nsfw のミュートを解除" }));
  await waitFor(() =>
    expect(useToast.getState().queue).toEqual([
      "ミュートリストが更新されていたため、変更しませんでした。最新の内容を表示したので、確認してもう一度操作してください",
    ]),
  );
});

it("ロック中は案内を出し、変更できない", () => {
  setMuteList({ ...LIST, locked: true });
  render(<MuteSection />);
  expect(
    screen.getByText("復号できない非公開項目があるため編集できません（上書きで失うのを防いでいます）"),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "#nsfw のミュートを解除" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();
});
