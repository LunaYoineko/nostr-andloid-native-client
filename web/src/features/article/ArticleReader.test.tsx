import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { NEVER } from "rxjs";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { useSession } from "../../signer/session";
import { installDialogPolyfill } from "../../test/dialog";
import { renderWithRouter } from "../../test/renderWithRouter";
import { useCompose } from "../compose/composeStore";
import type { ThreadEntry } from "../thread/threadTree";
import { ArticleReader } from "./ArticleReader";

// 署名・送信はしない
vi.mock("../../nostr/publish", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/publish")>()),
  publishEvent: vi.fn(),
}));

// 自分の kind:7 の購読・アクション周りの REQ はリレーへ張らない
vi.mock("../../nostr/pool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../nostr/pool")>()),
  subscribe: vi.fn(() => NEVER),
  subscribeTo: vi.fn(() => NEVER),
}));

beforeAll(() => {
  installDialogPolyfill();
});

beforeEach(() => {
  useSession.setState({ status: "in", method: "nip07", pubkey: getPublicKey(generateSecretKey()) });
});

function article(tags: string[][] = [], content = "# 見出し\n\n本文です。"): NostrEvent {
  return finalizeEvent(
    { kind: 30023, created_at: 1_700_000_000, tags: [["d", "x"], ...tags], content },
    generateSecretKey(),
  );
}

function comment(content: string, createdAt = 1_700_000_100): ThreadEntry {
  return {
    event: finalizeEvent({ kind: 1, created_at: createdAt, tags: [], content }, generateSecretKey()),
    depth: 0,
    isRoot: false,
    isFocused: false,
  };
}

it("タイトル・著者・概要・本文を出す", () => {
  const a = article([
    ["title", "記事のタイトル"],
    ["summary", "概要文"],
  ]);
  renderWithRouter(<ArticleReader article={a} comments={[]} onBack={() => {}} />);

  expect(screen.getByRole("heading", { level: 1, name: "記事のタイトル" })).toBeInTheDocument();
  expect(screen.getByText("概要文")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "見出し" })).toBeInTheDocument();
  expect(screen.getByText("本文です。")).toBeInTheDocument();
});

it("title タグが無ければ「無題の記事」", () => {
  renderWithRouter(<ArticleReader article={article()} comments={[]} onBack={() => {}} />);
  expect(screen.getByText("無題の記事")).toBeInTheDocument();
});

it("「コメント」を押すと記事への返信でコンポーザを開く", async () => {
  const user = userEvent.setup();
  const a = article([["title", "記事"]]);
  renderWithRouter(<ArticleReader article={a} comments={[]} onBack={() => {}} />);

  await user.click(screen.getByRole("button", { name: "コメント" }));

  expect(useCompose.getState().request).toEqual({ mode: "reply", target: a });
});

it("コメントが無ければ一覧見出しを出さない", () => {
  renderWithRouter(<ArticleReader article={article()} comments={[]} onBack={() => {}} />);
  expect(screen.queryByText(/^コメント \(/)).toBeNull();
});

it("コメントがあれば件数と本文を出す（記事への返信。記事本体は含まない）", () => {
  const entries = [comment("コメント本文1"), comment("コメント本文2")];
  renderWithRouter(<ArticleReader article={article()} comments={entries} onBack={() => {}} />);

  expect(screen.getByText("コメント (2)")).toBeInTheDocument();
  expect(screen.getByText("コメント本文1")).toBeInTheDocument();
  expect(screen.getByText("コメント本文2")).toBeInTheDocument();
});
