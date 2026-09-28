import { npubEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { expect, it } from "vitest";
import { DEFAULT_EMBED_PREFS, type EmbedPrefs } from "./embedPrefs";
import { cardedUrlsToHide, detectEmbeds, EMBED_LIMIT, visibleEmbeds } from "./linkTargets";

// applesauce の Tokens.link はホストにドットを要求するため、テストの URL は *.test にする

function note(content: string): NostrEvent {
  return finalizeEvent({ kind: 1, created_at: 1_800_000_000, tags: [], content }, generateSecretKey());
}

function prefs(patch: Partial<EmbedPrefs> = {}): EmbedPrefs {
  return { ...DEFAULT_EMBED_PREFS, ...patch };
}

it("画像を除いた URL を種別付きで出現順に返す（末尾の句読点は落とし、重複は 1 つ）", () => {
  const event = note(
    "見て https://a.test/page. と https://i.test/x.jpg と https://v.test/y.mp4 と https://youtu.be/dQw4w9WgXcQ\n" +
      "https://open.spotify.com/track/1 https://a.test/page",
  );
  expect(detectEmbeds(event)).toEqual([
    { url: "https://a.test/page", kind: "ogp" },
    { url: "https://v.test/y.mp4", kind: "video" },
    { url: "https://youtu.be/dQw4w9WgXcQ", kind: "youtube" },
    { url: "https://open.spotify.com/track/1", kind: "spotify" },
  ]);
});

it("nostr: 参照・URL でない文字は対象にしない。http も対象", () => {
  const npub = npubEncode(getPublicKey(generateSecretKey()));
  const event = note(`nostr:${npub} ftp://f.test/x http://h.test/x`);
  expect(detectEmbeds(event)).toEqual([{ url: "http://h.test/x", kind: "ogp" }]);
});

it("画像を除いた URL を出現順に 4 件まで（ネイティブの detectEmbeds(max = 4)）。同じイベントには同じ配列を返す", () => {
  const images = "https://i.test/1.png https://i.test/2.png https://i.test/3.png https://i.test/4.png";
  const event = note(
    `${images} https://a.test/1 https://a.test/2 https://a.test/3 https://a.test/4 https://a.test/5`,
  );
  expect(detectEmbeds(event).map((e) => e.url)).toEqual([
    "https://a.test/1",
    "https://a.test/2",
    "https://a.test/3",
    "https://a.test/4",
  ]);
  expect(detectEmbeds(event)).toBe(detectEmbeds(event));
});

it("URL が無ければ空", () => {
  expect(detectEmbeds(note("こんにちは"))).toEqual([]);
});

it("visibleEmbeds: 種別ごとのトグルで絞る。OFF で消えた分は後続の URL で詰めない", () => {
  const event = note(
    "https://v.test/1.mp4 https://youtu.be/dQw4w9WgXcQ https://open.spotify.com/x https://a.test/1 https://a.test/2",
  );
  // 上限 4 は video/youtube/spotify/ogp の 1 件目までで埋まり、a.test/2 は検出にすら入らない
  expect(detectEmbeds(event).map((e) => e.url)).toEqual([
    "https://v.test/1.mp4",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://open.spotify.com/x",
    "https://a.test/1",
  ]);

  expect(visibleEmbeds(event, prefs({ video: false })).map((e) => e.kind)).toEqual([
    "youtube",
    "spotify",
    "ogp",
  ]);
  expect(visibleEmbeds(event, prefs({ youtube: false })).map((e) => e.kind)).toEqual([
    "video",
    "spotify",
    "ogp",
  ]);
  expect(visibleEmbeds(event, prefs({ spotify: false })).map((e) => e.kind)).toEqual([
    "video",
    "youtube",
    "ogp",
  ]);
  expect(visibleEmbeds(event, prefs({ ogp: false })).map((e) => e.kind)).toEqual([
    "video",
    "youtube",
    "spotify",
  ]);
  // 全部 OFF でも a.test/2（5 件目）は出てこない
  expect(visibleEmbeds(event, prefs({ video: false, youtube: false, spotify: false, ogp: false }))).toEqual(
    [],
  );
});

it("cardedUrlsToHide: hideCardedUrls が ON なら実際に出る OGP・YouTube・Spotify の URL だけ返す", () => {
  const event = note(
    "https://v.test/1.mp4 https://youtu.be/dQw4w9WgXcQ https://open.spotify.com/x https://a.test/1",
  );
  expect(cardedUrlsToHide(event, prefs())).toEqual([
    "https://youtu.be/dQw4w9WgXcQ",
    "https://open.spotify.com/x",
    "https://a.test/1",
  ]);
  // OFF にした種別は畳まれない
  expect(cardedUrlsToHide(event, prefs({ ogp: false }))).toEqual([
    "https://youtu.be/dQw4w9WgXcQ",
    "https://open.spotify.com/x",
  ]);
});

it("cardedUrlsToHide: hideCardedUrls が OFF なら空", () => {
  const event = note("https://youtu.be/dQw4w9WgXcQ https://a.test/1");
  expect(cardedUrlsToHide(event, prefs({ hideCardedUrls: false }))).toEqual([]);
});

it("EMBED_LIMIT は 4", () => {
  expect(EMBED_LIMIT).toBe(4);
});
