import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { NEVER } from "rxjs";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { unixNow } from "../../lib/time";
import { type EventDraft, publishEvent } from "../../nostr/publish";
import { eventStore } from "../../nostr/store";
import { useSession } from "../../signer/session";
import { installDialogPolyfill } from "../../test/dialog";
import { renderWithRouter } from "../../test/renderWithRouter";
import { useToast } from "../../ui/toast";
import { useCompose } from "../compose/composeStore";
import { NoteFooter } from "../compose/NoteFooter";
import { EMPTY_MUTE_LIST, setMuteList } from "../mute/muteList";
import { MuteListError, muteUser, unmuteUser } from "../mute/muteSync";
import { toggleFollow } from "../profile/follow";
import { setDeveloperMode } from "../settings/devMode";
import { NoteActionButtons, REACTION_PENDING_MS } from "./NoteActionButtons";
import styles from "./NoteActionButtons.module.css";
import { setDefaultReaction, useDefaultReaction } from "./reactionPrefs";

// 署名・送信はしない（publishEvent だけ差し替えて draft を見る）
vi.mock("../../nostr/publish", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../nostr/publish")>();
  return { ...actual, publishEvent: vi.fn() };
});

// 自分の kind:7 の購読はリレーへ張らない
vi.mock("../../nostr/pool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../nostr/pool")>();
  return { ...actual, subscribe: vi.fn(() => NEVER) };
});

// ミュート / 解除は muteSync の関数を呼ぶところまで（取り直し・発行は muteSync.test.ts）
vi.mock("../mute/muteSync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../mute/muteSync")>();
  return {
    ...actual,
    muteUser: vi.fn(async () => "done" as const),
    unmuteUser: vi.fn(async () => "done" as const),
  };
});

// フォロー / 解除は #457 の関数を呼ぶところまで
vi.mock("../profile/follow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../profile/follow")>();
  return { ...actual, toggleFollow: vi.fn(async () => "done" as const) };
});

let meKey: Uint8Array;
let me: string;

beforeAll(() => {
  installDialogPolyfill();
});

beforeEach(() => {
  meKey = generateSecretKey();
  me = getPublicKey(meKey);
  useSession.setState({ status: "in", method: "nip07", pubkey: me });
  vi.mocked(publishEvent).mockReset();
  vi.mocked(publishEvent).mockImplementation(async (draft: EventDraft) =>
    finalizeEvent(
      { kind: draft.kind, content: draft.content, tags: draft.tags, created_at: unixNow() },
      meKey,
    ),
  );
  vi.mocked(toggleFollow).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  Reflect.deleteProperty(navigator, "clipboard");
  useDefaultReaction.setState({ content: "+", image: null });
  useCompose.setState({ request: null });
  useToast.setState({ queue: [] });
  useSession.setState({ status: "loading", method: null, pubkey: null });
  setDeveloperMode(false);
});

function post(key = generateSecretKey(), tags: string[][] = []): NostrEvent {
  return finalizeEvent({ kind: 1, created_at: unixNow(), tags, content: "本文です" }, key);
}

/** 自分のイベントをストアに入れる */
function addMine(kind: number, content: string, tags: string[][]): NostrEvent {
  const event = finalizeEvent({ kind, created_at: unixNow(), tags, content }, meKey);
  act(() => {
    eventStore.add(event);
  });
  return event;
}

function renderRow(event: NostrEvent) {
  return renderWithRouter(
    <NoteFooter event={event}>
      <NoteActionButtons event={event} />
    </NoteFooter>,
  );
}

function lastDraft(): EventDraft {
  const calls = vi.mocked(publishEvent).mock.calls;
  return calls[calls.length - 1][0];
}

function button(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

it("「操作」の並びは 返信・リポスト・リアクション・絵文字でリアクション・その他の操作", () => {
  renderRow(post());
  const group = screen.getByRole("group", { name: "操作" });
  expect(
    within(group)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label")),
  ).toEqual(["返信", "リポスト", "リアクション", "絵文字でリアクション", "その他の操作"]);
});

describe("リポスト", () => {
  it("「リポスト」で kind:6、「引用リポスト」で引用の投稿シート", async () => {
    const user = userEvent.setup();
    const event = post();
    renderRow(event);

    await user.click(button("リポスト"));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["リポスト", "引用リポスト"]);
    await user.click(screen.getByRole("menuitem", { name: "リポスト" }));
    expect(lastDraft()).toMatchObject({ kind: 6, content: "" });

    await user.click(button("リポスト"));
    await user.click(screen.getByRole("menuitem", { name: "引用リポスト" }));
    expect(useCompose.getState().request).toEqual({ mode: "quote", target: event });
  });

  it("自分の kind:6 があればトリガが緑（reposted）", () => {
    const event = post();
    renderRow(event);
    expect(button("リポスト")).not.toHaveClass(styles.reposted);
    addMine(6, "", [
      ["e", event.id],
      ["p", event.pubkey],
    ]);
    expect(button("リポスト")).toHaveClass(styles.reposted);
  });
});

describe("既定リアクション", () => {
  it("押すと kind:7 を送って署名待ち、自分の kind:7 が来たら押下で確定", async () => {
    const user = userEvent.setup();
    const event = post();
    renderRow(event);

    await user.click(button("リアクション"));
    expect(lastDraft()).toMatchObject({ kind: 7, content: "+" });
    expect(button("リアクション")).toHaveAttribute("aria-busy", "true");
    expect(button("リアクション")).toHaveAttribute("aria-pressed", "true");

    addMine(7, "+", [
      ["e", event.id],
      ["p", event.pubkey],
    ]);
    expect(button("リアクション")).toHaveAttribute("aria-pressed", "true");
    expect(button("リアクション")).not.toHaveAttribute("aria-busy", "true");
  });

  it("押下済みを押すと確認し、「取り消す」で kind:5", async () => {
    const user = userEvent.setup();
    const event = post();
    const reaction = addMine(7, "+", [["e", event.id]]);
    renderRow(event);
    expect(button("リアクション")).toHaveAttribute("aria-pressed", "true");

    await user.click(button("リアクション"));
    const dialog = screen.getByRole("dialog", { name: "リアクションを取り消しますか？" });
    expect(publishEvent).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "取り消す" }));
    expect(lastDraft()).toEqual({
      kind: 5,
      content: "",
      tags: [
        ["e", reaction.id],
        ["k", "7"],
      ],
    });
  });

  it("自分の kind:7 が来ないまま 6 秒で押下を戻す", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    renderRow(post());
    fireEvent.click(button("リアクション"));
    expect(button("リアクション")).toHaveAttribute("aria-pressed", "true");
    act(() => {
      vi.advanceTimersByTime(REACTION_PENDING_MS);
    });
    expect(button("リアクション")).toHaveAttribute("aria-pressed", "false");
  });

  it("既定が ⭐ なら ☆、+ なら ♡", () => {
    const event = post();
    const { unmount } = renderRow(event);
    expect(button("リアクション").querySelector("[data-shape]")).toHaveAttribute("data-shape", "heart");
    unmount();
    setDefaultReaction("⭐", null);
    renderRow(event);
    expect(button("リアクション").querySelector("[data-shape]")).toHaveAttribute("data-shape", "star");
  });
});

it("「絵文字でリアクション」→ ピッカーで 😄 → kind:7", async () => {
  const user = userEvent.setup();
  renderRow(post());
  await user.click(button("絵文字でリアクション"));
  const dialog = screen.getByRole("dialog", { name: "リアクション" });
  await user.click(within(dialog).getByRole("button", { name: "😄" }));
  expect(lastDraft()).toMatchObject({ kind: 7, content: "😄" });
  expect(screen.queryByRole("dialog", { name: "リアクション" })).toBeNull();
});

describe("⚡ Zap", () => {
  /** 作者の kind:0（lud16 は任意）をストアに入れる */
  function addProfile(key: Uint8Array, lud16?: string) {
    const content = JSON.stringify(lud16 ? { name: "作者", lud16 } : { name: "作者" });
    act(() => {
      eventStore.add(finalizeEvent({ kind: 0, created_at: unixNow(), tags: [], content }, key));
    });
  }

  /** target への Zap 受領（金額は bolt11） */
  function addZap(target: NostrEvent, bolt11: string) {
    act(() => {
      eventStore.add(
        finalizeEvent(
          {
            kind: 9735,
            created_at: unixNow(),
            tags: [
              ["e", target.id],
              ["p", target.pubkey],
              ["bolt11", bolt11],
            ],
            content: "",
          },
          generateSecretKey(),
        ),
      );
    });
  }

  it("作者に lud16 が無く受領も 0 なら ⚡ を出さない", () => {
    const key = generateSecretKey();
    addProfile(key);
    renderRow(post(key));
    expect(screen.queryByRole("img", { name: /Zap/ })).toBeNull();
  });

  it("lud16 があり受領 0 なら灰色の ⚡ だけ（金額なし・押せない）", () => {
    const key = generateSecretKey();
    addProfile(key, "alice@getalby.com");
    renderRow(post(key));
    const zap = screen.getByRole("img", { name: "Zap" });
    expect(zap).toHaveClass(styles.zap);
    expect(zap).not.toHaveClass(styles.zapped);
    expect(zap).toHaveTextContent(/^$/);
    expect(screen.queryByRole("button", { name: /Zap/ })).toBeNull();
  });

  it("受領があれば lud16 が無くても ⚡ と合計（formatSats）を --zap の色で出す", () => {
    const key = generateSecretKey();
    addProfile(key);
    const event = post(key);
    renderRow(event);
    addZap(event, "lnbc10u1pxxxxxx");
    addZap(event, "lnbc2340n1pxxxxxx");
    const zap = screen.getByRole("img", { name: "Zap 1.2k sats" });
    expect(zap).toHaveClass(styles.zapped);
    expect(zap).toHaveTextContent("1.2k");
  });
});

describe("⋯ メニュー", () => {
  it("他人の投稿: client の見出し。自分の kind:3 が無ければフォロー項目なし、あれば「フォロー解除」→ 確認", async () => {
    const user = userEvent.setup();
    const event = post(generateSecretKey(), [["client", "Nostrism"]]);
    renderRow(event);

    await user.click(button("その他の操作"));
    expect(screen.getByText("Nostrism から投稿")).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: /フォロー/ })).toBeNull();
    await user.keyboard("{Escape}");

    addMine(3, "", [["p", event.pubkey]]);
    await user.click(button("その他の操作"));
    await user.click(screen.getByRole("menuitem", { name: "フォロー解除" }));
    const dialog = screen.getByRole("dialog", { name: "フォローを解除しますか？" });
    await user.click(within(dialog).getByRole("button", { name: "解除する" }));
    expect(toggleFollow).toHaveBeenCalledWith(me, event.pubkey, "unfollow");
  });

  it("未フォローの「フォロー」は確認なしで #457 のフォローを呼ぶ", async () => {
    const user = userEvent.setup();
    const event = post();
    addMine(3, "", []);
    renderRow(event);
    await user.click(button("その他の操作"));
    await user.click(screen.getByRole("menuitem", { name: "フォロー" }));
    expect(toggleFollow).toHaveBeenCalledWith(me, event.pubkey, "follow");
  });

  it("「このユーザーをミュート」→ 確認 →「ミュート」で muteUser とトースト。ミュート中は「ミュートを解除」", async () => {
    const user = userEvent.setup();
    const event = post();
    renderRow(event);
    await user.click(button("その他の操作"));
    await user.click(screen.getByRole("menuitem", { name: "このユーザーをミュート" }));
    const dialog = screen.getByRole("dialog", { name: "このユーザーをミュートしますか？" });
    await user.click(within(dialog).getByRole("button", { name: "ミュート" }));
    expect(muteUser).toHaveBeenCalledWith(me, event.pubkey);
    await waitFor(() => expect(useToast.getState().queue).toEqual(["ミュートしました"]));

    act(() =>
      setMuteList({
        ...EMPTY_MUTE_LIST,
        entries: [{ category: "p", value: event.pubkey, isPublic: false, isPrivate: true }],
      }),
    );
    vi.mocked(unmuteUser).mockRejectedValueOnce(new MuteListError("locked"));
    await user.click(button("その他の操作"));
    await user.click(screen.getByRole("menuitem", { name: "ミュートを解除" }));
    expect(unmuteUser).toHaveBeenCalledWith(me, event.pubkey);
    await waitFor(() =>
      expect(useToast.getState().queue).toEqual([
        "ミュートしました",
        "ミュートリストが変更できません（ロック中の可能性）",
      ]),
    );
    act(() => setMuteList(null));
  });

  it("「通報」→ 理由「スパム」で kind:1984", async () => {
    const user = userEvent.setup();
    const event = post();
    renderRow(event);
    await user.click(button("その他の操作"));
    await user.click(screen.getByRole("menuitem", { name: "通報" }));
    const dialog = screen.getByRole("dialog", { name: "この投稿を通報" });
    await user.click(within(dialog).getByRole("button", { name: "スパム" }));
    expect(lastDraft()).toEqual({
      kind: 1984,
      content: "",
      tags: [
        ["e", event.id, "spam"],
        ["p", event.pubkey],
      ],
    });
    expect(screen.queryByRole("dialog", { name: "この投稿を通報" })).toBeNull();
  });

  it("自分の投稿: 「削除をリクエスト」→ 確認 →「リクエストする」で kind:5 とトースト", async () => {
    const user = userEvent.setup();
    const event = post(meKey);
    renderRow(event);
    await user.click(button("その他の操作"));
    expect(screen.queryByRole("menuitem", { name: "通報" })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "削除をリクエスト" }));
    const dialog = screen.getByRole("dialog", { name: "この投稿の削除をリクエストしますか？" });
    await user.click(within(dialog).getByRole("button", { name: "リクエストする" }));
    expect(lastDraft()).toEqual({
      kind: 5,
      content: "",
      tags: [
        ["e", event.id],
        ["k", "1"],
      ],
    });
    await waitFor(() => expect(useToast.getState().queue).toEqual(["削除をリクエストしました"]));
  });

  it("「リンクをコピー（njump）」は njump の URL を書いてトースト。失敗は「コピーできませんでした」", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderRow(post());

    await user.click(button("その他の操作"));
    await user.click(screen.getByRole("menuitem", { name: "リンクをコピー（njump）" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/njump\.me\/nevent1/));
    await waitFor(() => expect(useToast.getState().queue).toEqual(["コピーしました"]));

    await user.click(button("その他の操作"));
    await user.click(screen.getByRole("menuitem", { name: "リンクをコピー（njump）" }));
    await waitFor(() =>
      expect(useToast.getState().queue).toEqual(["コピーしました", "コピーできませんでした"]),
    );
  });

  it("開発者モードが OFF なら「イベントJSONを表示」は無い", async () => {
    const user = userEvent.setup();
    renderRow(post());
    await user.click(button("その他の操作"));
    expect(screen.getByRole("menuitem", { name: "テキストをコピー" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "イベントJSONを表示" })).toBeNull();
  });

  it("開発者モードが ON なら末尾の「イベントJSONを表示」で整形した JSON を出し、コピーでトースト", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    setDeveloperMode(true);
    const event = post();
    renderRow(event);

    await user.click(button("その他の操作"));
    const items = screen.getAllByRole("menuitem");
    expect(items.at(-1)).toHaveTextContent("イベントJSONを表示");
    await user.click(screen.getByRole("menuitem", { name: "イベントJSONを表示" }));

    const dialog = screen.getByRole("dialog", { name: "イベントJSON" });
    const expected = JSON.stringify(
      {
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        kind: 1,
        tags: [],
        content: "本文です",
        sig: event.sig,
      },
      null,
      2,
    );
    expect(dialog.querySelector("pre")?.textContent).toBe(expected);
    expect(within(dialog).getByText("kind:1")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "テキストをコピー" }));
    expect(writeText).toHaveBeenCalledWith(expected);
    await waitFor(() => expect(useToast.getState().queue).toEqual(["JSONをコピーしました"]));

    await user.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: "イベントJSON" })).toBeNull();
  });
});
