import { npubEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { linkCardUrls } from "./linkTargets";

// applesauce の Tokens.link はホストにドットを要求するため、テストの URL は *.test にする

function note(content: string): NostrEvent {
  return finalizeEvent({ kind: 1, created_at: 1_800_000_000, tags: [], content }, generateSecretKey());
}

it("画像・動画・YouTube 以外の URL を出現順に返す（末尾の句読点は落とし、重複は 1 つ）", () => {
  const event = note(
    "見て https://a.test/page. と https://i.test/x.jpg と https://v.test/y.mp4 と https://youtu.be/dQw4w9WgXcQ\n" +
      "https://b.test/?q=1 https://a.test/page",
  );
  expect(linkCardUrls(event)).toEqual(["https://a.test/page", "https://b.test/?q=1"]);
});

it("nostr: 参照・URL でない文字はカードにしない。http も対象（取得できるかは取得側が決める）", () => {
  const npub = npubEncode(getPublicKey(generateSecretKey()));
  const event = note(`nostr:${npub} ftp://f.test/x http://h.test/x`);
  expect(linkCardUrls(event)).toEqual(["http://h.test/x"]);
});

it("画像を除いた URL を出現順に 4 件まで数え、その中のリンクだけを返す（ネイティブの detectEmbeds(max = 4)）", () => {
  const images = "https://i.test/1.png https://i.test/2.png https://i.test/3.png https://i.test/4.png";
  expect(
    linkCardUrls(
      note(`${images} https://a.test/1 https://a.test/2 https://a.test/3 https://a.test/4 https://a.test/5`),
    ),
  ).toEqual(["https://a.test/1", "https://a.test/2", "https://a.test/3", "https://a.test/4"]);

  // 動画 2 本・YouTube 1 本が先に出ていれば、リンクは 1 件だけ
  expect(
    linkCardUrls(
      note(
        "https://v.test/1.mp4 https://a.test/1 https://youtu.be/dQw4w9WgXcQ https://v.test/2.webm https://a.test/2",
      ),
    ),
  ).toEqual(["https://a.test/1"]);
});

it("URL が無ければ空。同じイベントには同じ配列を返す", () => {
  expect(linkCardUrls(note("こんにちは"))).toEqual([]);
  const event = note("https://a.test/");
  expect(linkCardUrls(event)).toBe(linkCardUrls(event));
});
