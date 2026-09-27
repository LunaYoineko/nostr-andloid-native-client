import type { Content } from "applesauce-content/nast";
import { neventEncode, noteEncode, npubEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, type NostrEvent } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { parseNoteContent, splitTrailingPunct, withoutLinks, withoutMention } from "./parse";

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
      case "mention":
        return { mention: node.encoded, type: node.decoded.type };
      case "emoji":
        return { emoji: node.code, url: node.url };
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

const NPUB = npubEncode("a".repeat(64));
const NOTE = noteEncode("b".repeat(64));
const NEVENT = neventEncode({ id: "c".repeat(64) });

it("日本語の直後・「」の中・( の直後の nostr: 参照と素の bech32 を mention にする（#479）", () => {
  const root = parseNoteContent(note(`これnostr:${NPUB}です「${NOTE}」文(${NEVENT})`));
  expect(shape(root.children)).toEqual([
    { text: "これ" },
    { mention: NPUB, type: "npub" },
    { text: "です「" },
    { mention: NOTE, type: "note" },
    { text: "」文(" },
    { mention: NEVENT, type: "nevent" },
    { text: ")" },
  ]);
});

it("引用に出した日本語直後の nevent は本文から消せる（#479）", () => {
  const root = parseNoteContent(note(`見てnostr:${NEVENT}\nいいね`));
  expect(shape(withoutMention(root, NEVENT).children)).toEqual([{ text: "見て" }, { text: "いいね" }]);
});

it("デコードできない参照・大文字の参照は書かれた文字のまま", () => {
  const broken = `${NPUB.slice(0, -1)}${NPUB.endsWith("q") ? "p" : "q"}`;
  const root = parseNoteContent(note(`a nostr:${broken} b ${NPUB.toUpperCase()}`));
  expect(shape(root.children)).toEqual([{ text: `a nostr:${broken} b ${NPUB.toUpperCase()}` }]);
});

it("カスタム絵文字は日本語の shortcode も拾い、大文字小文字を区別して emoji タグと照合する（#479）", () => {
  const root = parseNoteContent(
    note(":おはよう: :Smile: :smile: :none:", [
      ["emoji", "おはよう", "https://e.test/o.png"],
      ["emoji", "smile", "https://e.test/s.png"],
    ]),
  );
  expect(shape(root.children)).toEqual([
    { emoji: "おはよう", url: "https://e.test/o.png" },
    { text: " :Smile: " },
    { emoji: "smile", url: "https://e.test/s.png" },
    { text: " :none:" },
  ]);
});

it("同じ shortcode の emoji タグが複数あれば後のものを使う", () => {
  const root = parseNoteContent(
    note(":a:", [
      ["emoji", "a", "https://e.test/1.png"],
      ["emoji", "a", "https://e.test/2.png"],
    ]),
  );
  expect(shape(root.children)).toEqual([{ emoji: "a", url: "https://e.test/2.png" }]);
});

it("直前が英数字・日本語の # もタグにする（#479）", () => {
  const root = parseNoteContent(note("abc#tag C#言語"));
  expect(shape(root.children)).toEqual([
    { text: "abc" },
    { hashtag: "tag", name: "tag" },
    { text: " C" },
    { hashtag: "言語", name: "言語" },
  ]);
});

it("link にならなかった http(s):// から空白までは文字のまま（中の # や参照を拾わない）", () => {
  const root = parseNoteContent(note(`https://example#tag/${NPUB} #ok`));
  expect(shape(root.children)).toEqual([
    { text: `https://example#tag/${NPUB} ` },
    { hashtag: "ok", name: "ok" },
  ]);
});

it("t タグがあれば hashtag ノードに添える", () => {
  const root = parseNoteContent(note("#nostr", [["t", "nostr"]]));
  expect(root.children[0]).toMatchObject({ type: "hashtag", tag: ["t", "nostr"] });
});

it("withoutLinks はカードに出した URL の link を除き、空白・改行を潰して trim する（末尾の句読点は残す）", () => {
  const root = parseNoteContent(
    note("見て https://a.test/1.  と\n\n\nhttps://b.test/2\nhttps://c.test/3 おわり"),
  );
  expect(shape(withoutLinks(root, ["https://a.test/1", "https://c.test/3"]).children)).toEqual([
    { text: "見て . と\n\n" },
    { link: "https://b.test/2" },
    { text: "\n おわり" },
  ]);
  // リンクだけの本文は空になる
  expect(withoutLinks(parseNoteContent(note("https://a.test/1\n")), ["https://a.test/1"]).children).toEqual(
    [],
  );
});

it("withoutLinks は除くものが無ければ元の木をそのまま返し、キャッシュ済みの木を書き換えない", () => {
  const event = note("a  https://a.test/1  b");
  const root = parseNoteContent(event);
  expect(withoutLinks(root, [])).toBe(root);
  expect(withoutLinks(root, ["https://other.test/"])).toBe(root);
  expect(shape(withoutLinks(root, ["https://a.test/1"]).children)).toEqual([{ text: "a b" }]);
  expect(shape(parseNoteContent(event).children)).toEqual([
    { text: "a  " },
    { link: "https://a.test/1" },
    { text: "  b" },
  ]);
});

it("splitTrailingPunct は URL と末尾の句読点を分ける", () => {
  expect(splitTrailingPunct("https://x.co/a.")).toEqual(["https://x.co/a", "."]);
  expect(splitTrailingPunct("https://x.co/a")).toEqual(["https://x.co/a", ""]);
});

it("同じイベントなら同じ構文木を返す（キャッシュ）", () => {
  const event = note("hello #nostr");
  expect(parseNoteContent(event)).toBe(parseNoteContent(event));
});
