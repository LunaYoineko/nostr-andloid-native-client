import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { neventEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { expect, it, vi } from "vitest";
import { shortNpub } from "../../lib/npub";
import { unixNow } from "../../lib/time";
import { eventStore } from "../../nostr/store";
import { renderWithRouter } from "../../test/renderWithRouter";
import { NoteItem } from "./NoteItem";

// applesauce の Tokens.link はホストにドットを要求するため、テストの URL は *.test にする

/** 名前（とその他の項目）を持つプロフィールを入れ、その鍵を返す */
function withProfile(fields: Record<string, string>): Uint8Array {
  const key = generateSecretKey();
  eventStore.add(
    finalizeEvent({ kind: 0, created_at: unixNow(), tags: [], content: JSON.stringify(fields) }, key),
  );
  return key;
}

function post(
  content: string,
  {
    key = generateSecretKey(),
    tags = [],
    kind = 1,
  }: { key?: Uint8Array; tags?: string[][]; kind?: number } = {},
): NostrEvent {
  return finalizeEvent({ kind, created_at: unixNow(), tags, content }, key);
}

/** ストアに入れた投稿 */
function stored(content: string, options: Parameters<typeof post>[1] = {}): NostrEvent {
  const event = post(content, options);
  eventStore.add(event);
  return event;
}

const CARD = { name: "引用元の投稿を開く" } as const;

it("kind:6 は「〜がリポスト」の行と content に埋め込まれた元投稿を出す", async () => {
  const reposterKey = withProfile({ name: "bob" });
  const original = finalizeEvent(
    { kind: 1, created_at: unixNow() - 180, tags: [], content: "元の投稿です" },
    generateSecretKey(),
  );
  const repost = finalizeEvent(
    {
      kind: 6,
      created_at: unixNow(),
      tags: [
        ["e", original.id],
        ["p", original.pubkey],
      ],
      content: JSON.stringify(original),
    },
    reposterKey,
  );

  renderWithRouter(<NoteItem event={repost} />);

  expect(await screen.findByText("bob")).toBeInTheDocument();
  expect(screen.getByText("がリポスト")).toBeInTheDocument();
  expect(screen.getByText("元の投稿です")).toBeInTheDocument();
  expect(screen.getByText("3m")).toBeInTheDocument();
});

it("CW 付きは「表示」を押すまで本文も引用も出さない", async () => {
  const quoted = stored("引用された投稿");
  const event = post("秘密", {
    tags: [
      ["content-warning", "nsfw"],
      ["q", quoted.id],
    ],
  });

  renderWithRouter(<NoteItem event={event} />);

  expect(screen.queryByText("秘密")).toBeNull();
  expect(screen.queryByRole("link", CARD)).toBeNull();
  expect(screen.queryByText("引用元を読み込み中…")).toBeNull();
  expect(screen.getByText("nsfw")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /センシティブな内容/ }));

  expect(screen.getByText("秘密")).toBeInTheDocument();
  expect(screen.getByRole("link", CARD)).toHaveTextContent("引用された投稿");
});

it("返信は親の名前と本文 1 行を返信アイコン付きのリンクで出す", async () => {
  const parent = stored("a\nb https://i.test/x.jpg", { key: withProfile({ name: "carol" }) });
  const reply = post("返信です", { tags: [["e", parent.id, "", "reply"]] });

  renderWithRouter(<NoteItem event={reply} />);

  const line = await screen.findByText("carol: a b");
  const link = line.closest("a");
  expect(link).toHaveAttribute("href", `/e/${neventEncode({ id: parent.id })}`);
  expect(link?.querySelector("svg")).not.toBeNull();
});

it("返信の親がストアに無ければ返信行を出さない", () => {
  const reply = post("返信です", { tags: [["e", "f".repeat(64), "", "reply"]] });

  const { container } = renderWithRouter(<NoteItem event={reply} />);

  expect(screen.getByText("返信です")).toBeInTheDocument();
  expect(container.querySelector('a[href^="/e/"]')).toBeNull();
});

it("kind:1111 で親が取れていない間は K タグから「kind N へのコメント」を出す", () => {
  const comment = post("コメント", {
    kind: 1111,
    tags: [
      ["E", "e".repeat(64)],
      ["K", "30023"],
    ],
  });

  renderWithRouter(<NoteItem event={comment} />);

  expect(screen.getByText("kind 30023 へのコメント")).toBeInTheDocument();
});

it("本文の nevent が取れていれば引用カードにし、本文側の参照を消す", async () => {
  const quoted = stored("引用元の本文 https://x.test/page #tag", { key: withProfile({ name: "dave" }) });
  const nevent = neventEncode({ id: quoted.id });

  renderWithRouter(<NoteItem event={post(`見て nostr:${nevent}`)} />);

  const card = screen.getByRole("link", CARD);
  expect(card).toHaveAttribute("href", `/e/${nevent}`);
  expect(await within(card).findByText("dave")).toBeInTheDocument();
  expect(card).toHaveTextContent("引用元の本文");
  expect(card.querySelector("a")).toBeNull();
  expect(screen.queryByText(`↗${nevent.slice(0, 12)}…`)).toBeNull();
  expect(screen.getByText("見て")).toBeInTheDocument();
});

it("本文の nevent が取れていなければ ↗ のリンクを残し、読み込み中のカードを出す", () => {
  const nevent = neventEncode({ id: "d".repeat(64) });

  renderWithRouter(<NoteItem event={post(`見て nostr:${nevent}`)} />);

  expect(screen.getByRole("link", { name: `↗${nevent.slice(0, 12)}…` })).toHaveAttribute(
    "href",
    `/e/${nevent}`,
  );
  expect(screen.getByText("引用元を読み込み中…")).toBeInTheDocument();
  expect(screen.queryByRole("link", CARD)).toBeNull();
});

it("引用元がさらに引用していてもカードは 1 段だけ", () => {
  const inner = stored("内側の投稿");
  const outer = stored(`外側 nostr:${neventEncode({ id: inner.id })}`);

  renderWithRouter(<NoteItem event={post(`nostr:${neventEncode({ id: outer.id })}`)} />);

  expect(screen.getAllByRole("link", CARD)).toHaveLength(1);
  expect(screen.queryByText("内側の投稿")).toBeNull();
});

it("引用元と返信の親が同じなら返信行を出さない", () => {
  const quoted = stored("引用兼親", { key: withProfile({ name: "erin" }) });

  renderWithRouter(
    <NoteItem
      event={post(`nostr:${neventEncode({ id: quoted.id })}`, { tags: [["e", quoted.id, "", "reply"]] })}
    />,
  );

  expect(screen.getAllByRole("link", CARD)).toHaveLength(1);
  expect(screen.queryByText(/^erin: /)).toBeNull();
});

it("引用元に content-warning があればカードは「センシティブな内容」だけ", () => {
  const quoted = stored("隠す本文", { tags: [["content-warning", "spoiler"]] });

  renderWithRouter(<NoteItem event={post("", { tags: [["q", quoted.id]] })} />);

  const card = screen.getByRole("link", CARD);
  expect(within(card).getByText("センシティブな内容")).toBeInTheDocument();
  expect(card).not.toHaveTextContent("隠す本文");
});

it("引用元の画像 2 枚と動画 1 本をカードにサムネイルで並べる", () => {
  const quoted = stored("写真 https://i.test/1.jpg https://i.test/2.png https://v.test/1.mp4");

  renderWithRouter(<NoteItem event={post("", { tags: [["q", quoted.id]] })} />);

  const card = screen.getByRole("link", CARD);
  const images = card.querySelectorAll("img");
  expect(images).toHaveLength(2);
  for (const img of images) {
    expect(img.getAttribute("src")).toContain("w=640");
    expect(img.getAttribute("src")).toContain("q=80");
  }
  expect(within(card).getAllByText("動画")).toHaveLength(1);
});

it("client タグは時刻の title にだけ出す", () => {
  const { container } = renderWithRouter(<NoteItem event={post("hi", { tags: [["client", "Nostrism"]] })} />);

  const time = container.querySelector("time");
  expect(time?.getAttribute("title")).toMatch(/ · Nostrism から投稿$/);
  expect(container).not.toHaveTextContent("Nostrism");
});

it("NIP-05 を名前の横に出す", async () => {
  const key = withProfile({ name: "alice", nip05: "alice@example.com" });

  renderWithRouter(<NoteItem event={post("hi", { key })} />);

  expect(await screen.findByText("alice@example.com")).toBeInTheDocument();
});

it("相対時刻は時間が経つと進む", () => {
  vi.useFakeTimers();
  try {
    const { container } = renderWithRouter(<NoteItem event={post("時計")} />);
    const time = container.querySelector("time");
    expect(time).toHaveTextContent("now");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(time).toHaveTextContent("1m");
  } finally {
    vi.useRealTimers();
  }
});

it("画像だけの投稿は本文を出さず、暫定のリンクを 1 つ出す", () => {
  const key = generateSecretKey();
  const { container } = renderWithRouter(<NoteItem event={post("https://i.test/only.jpg", { key })} />);

  const links = screen.getAllByRole("link", { name: "https://i.test/only.jpg" });
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAttribute("href", "https://i.test/only.jpg");
  // 記事の文字は 名前・時刻・暫定リンクだけ（本文も折りたたみのトグルも無い）
  const name = shortNpub(getPublicKey(key));
  expect(container.querySelector("article")?.textContent).toBe(`${name}nowhttps://i.test/only.jpg`);
  expect(screen.queryByRole("button")).toBeNull();
});
