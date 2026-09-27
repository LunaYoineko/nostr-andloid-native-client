import type { Content } from "applesauce-content/nast";
import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { parseNoteContent, splitTrailingPunct } from "./parse";

// applesauce の Tokens.link はホストにドットを要求するため、テストの URL は *.test にする

function note(content: string, tags: string[][] = []): NostrEvent {
  return finalizeEvent({ kind: 1, created_at: 1_800_000_000, tags, content }, generateSecretKey());
}

/** 位置情報・eol を除いた種類と中身だけ */
function shape(children: Content[]) {
  return children.map((node) => {
    switch (node.type) {
      case "text":
        return { text: node.value };
      case "link":
        return { link: node.href };
      case "hashtag":
        return { hashtag: node.hashtag, name: node.name };
      default:
        return { [node.type]: true };
    }
  });
}

it("画像の URL を本文から除き、3 連以上の改行を潰して前後を trim する", () => {
  expect(shape(parseNoteContent(note("見て\n\nhttps://i.test/1.jpg\n\n\n終わり")).children)).toEqual([
    { text: "見て\n\n終わり" },
  ]);
});

it("動画・YouTube の URL も除き、連続した空白を 1 つに潰す", () => {
  const root = parseNoteContent(note("  a https://v.test/1.mp4  b https://youtu.be/dQw4w9WgXcQ \n"));
  expect(shape(root.children)).toEqual([{ text: "a b" }]);
});

it("画像だけの gallery は丸ごと除く", () => {
  const root = parseNoteContent(note("https://i.test/1.jpg\nhttps://i.test/2.png"));
  expect(root.children).toEqual([]);
});

it("gallery に画像と非画像（.svg）が混ざっていれば、画像だけ除いて .svg は link として残す", () => {
  const root = parseNoteContent(note("図 https://i.test/1.png\nhttps://i.test/2.svg"));
  expect(shape(root.children)).toEqual([{ text: "図 " }, { link: "https://i.test/2.svg" }]);
});

it("混在 gallery で非メディアが 2 本以上残れば、リンクの間に改行を挟む", () => {
  const root = parseNoteContent(note("https://i.test/1.svg\nhttps://i.test/2.png\nhttps://i.test/3.svg"));
  expect(shape(root.children)).toEqual([
    { link: "https://i.test/1.svg" },
    { text: "\n" },
    { link: "https://i.test/3.svg" },
  ]);
});

it("メディアでない URL は残し、何も除かなければ空白・改行はそのまま", () => {
  const root = parseNoteContent(note("  a   https://x.test/page\n\n\n\nb"));
  expect(shape(root.children)).toEqual([
    { text: "  a   " },
    { link: "https://x.test/page" },
    { text: "\n\n\n\nb" },
  ]);
});

it("t タグが無くても #タグ にし（hashtag は小文字）、URL 中の # はタグにしない", () => {
  const root = parseNoteContent(note("#Nostr と #タグ、と #zap! https://x.co/#frag"));
  const hashtags = root.children.filter((node) => node.type === "hashtag");
  expect(shape(hashtags)).toEqual([
    { hashtag: "nostr", name: "Nostr" },
    { hashtag: "タグ", name: "タグ" },
    { hashtag: "zap", name: "zap" },
  ]);
  expect(shape(root.children.filter((node) => node.type === "link"))).toEqual([
    { link: "https://x.co/#frag" },
  ]);
});

it("t タグがあれば hashtag ノードに添える", () => {
  const root = parseNoteContent(note("#nostr", [["t", "nostr"]]));
  expect(root.children[0]).toMatchObject({ type: "hashtag", tag: ["t", "nostr"] });
});

it("splitTrailingPunct は URL と末尾の句読点を分ける", () => {
  expect(splitTrailingPunct("https://x.co/a.")).toEqual(["https://x.co/a", "."]);
  expect(splitTrailingPunct("https://x.co/a")).toEqual(["https://x.co/a", ""]);
});

it("同じイベントなら同じ構文木を返す（キャッシュ）", () => {
  const event = note("hello #nostr");
  expect(parseNoteContent(event)).toBe(parseNoteContent(event));
});
