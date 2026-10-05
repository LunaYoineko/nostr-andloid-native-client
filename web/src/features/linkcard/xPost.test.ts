import { expect, it } from "vitest";
import {
  canonicalPostUrl,
  dateFromOembedHtml,
  handleFromUrl,
  isPostUrl,
  isProfileImage,
  parseTitle,
  profileUrl,
  xPostFrom,
} from "./xPost";

// ネイティブ XPostTest の移植
const url = "https://x.com/jack/status/20";

it("post_urls_are_detected_in_their_variants", () => {
  for (const u of [
    "https://x.com/jack/status/20",
    "https://twitter.com/jack/status/20",
    "https://mobile.twitter.com/jack/status/20",
    "https://www.x.com/jack/status/20?s=20&t=abc",
    "https://x.com/jack/statuses/20",
  ]) {
    expect(isPostUrl(u), u).toBe(true);
  }
  for (const u of [
    "https://x.com/jack",
    "https://x.com/home",
    "https://x.com/i/spaces/1abc",
    "https://example.com/x.com/jack/status/20",
  ]) {
    expect(isPostUrl(u), u).toBe(false);
  }
});

it("title_is_parsed_in_english_and_japanese_forms", () => {
  expect(parseTitle("jack (@jack) on X")).toEqual(["jack", "jack"]);
  expect(parseTitle("Barack Obama (@BarackObama) on Twitter")).toEqual(["Barack Obama", "BarackObama"]);
  expect(parseTitle("jack (@jack) / X")).toEqual(["jack", "jack"]);
  expect(parseTitle("Xユーザーの極上のスイーツ（@sweetroad5）さん")).toEqual([
    "極上のスイーツ",
    "sweetroad5",
  ]);
  // 名前に括弧や記号が入っていてもハンドルで区切る。
  expect(parseTitle("Xユーザーの𝓜ᒼᑋªⁿ✨ (bot)（@makimakiia）さん")).toEqual(["𝓜ᒼᑋªⁿ✨ (bot)", "makimakiia"]);
  expect(parseTitle("X")).toBeNull();
  expect(parseTitle("Log in to X")).toBeNull();
});

it("builds_card_with_photo_from_ogp", () => {
  const p = xPostFrom(url, {
    url,
    title: "Xユーザーの極上のスイーツ（@sweetroad5）さん",
    description: "新発売されます✨\nhttps://t.co/jg6oWf2wRo",
    image: "https://pbs.twimg.com/media/abc.jpg",
    siteName: "X",
  });
  expect(p?.name).toBe("極上のスイーツ");
  expect(p?.handle).toBe("sweetroad5");
  expect(p?.text).toBe("新発売されます✨\nhttps://t.co/jg6oWf2wRo");
  expect(p?.image).toBe("https://pbs.twimg.com/media/abc.jpg");
  expect(p?.avatar).toBeNull();
});

it("profile_image_becomes_avatar_not_photo", () => {
  const p = xPostFrom(url, {
    url,
    title: "jack (@jack) on X",
    description: "just setting up my twttr",
    image: "https://pbs.twimg.com/profile_images/1/azNjKOSH_400x400.jpg",
  });
  expect(p?.image).toBeNull();
  expect(p?.avatar).toBe("https://pbs.twimg.com/profile_images/1/azNjKOSH_400x400.jpg");
});

it("falls_back_to_handle_from_url_when_title_is_unreadable", () => {
  const p = xPostFrom(url, { url, title: "X", description: "hello" });
  expect(p?.name).toBeNull();
  expect(p?.handle).toBe("jack");
  expect(handleFromUrl("https://twitter.com/Foo_1/status/9")).toBe("Foo_1");
});

it("date_is_read_from_oembed_html_in_both_languages", () => {
  const ja =
    '<blockquote class="twitter-tweet"><p lang="ja" dir="ltr">新発売 <a href="https://t.co/x">pic.twitter.com/x</a></p>&mdash; 極上のスイーツ (@sweetroad5) <a href="https://twitter.com/sweetroad5/status/2106722627310284812?ref_src=twsrc%5Etfw">2026年10月4日</a></blockquote>\n';
  expect(dateFromOembedHtml(ja)).toBe("2026年10月4日");
  const en =
    '<blockquote class="twitter-tweet"><p>just setting up my twttr</p>&mdash; jack (@jack) <a href="https://twitter.com/jack/status/20?ref_src=twsrc%5Etfw">March 21, 2006</a></blockquote>';
  expect(dateFromOembedHtml(en)).toBe("March 21, 2006");
  expect(dateFromOembedHtml("<p>no blockquote</p>")).toBeNull();
});

it("profile_image_detection_and_profile_url", () => {
  expect(isProfileImage("https://pbs.twimg.com/profile_images/1/a_200x200.jpg")).toBe(true);
  expect(isProfileImage("https://pbs.twimg.com/media/HTy.jpg")).toBe(false);
  expect(isProfileImage(null)).toBe(false);
  expect(profileUrl("jack")).toBe("https://x.com/jack");
});

it("deleted_or_missing_posts_fall_back_to_the_plain_link_card", () => {
  expect(
    xPostFrom(url, {
      url,
      title: "X",
      description: "The post you're looking for could not be found or may have been deleted.",
    }),
  ).toBeNull();
  expect(xPostFrom(url, { url, title: "jack (@jack) on X", description: "" })).toBeNull();
  expect(xPostFrom(url, { url, title: "jack (@jack) on X" })).toBeNull();
  expect(xPostFrom(url, null)).toBeNull();
  // 投稿 URL でなければ組み立てない。
  const profile = "https://x.com/jack";
  expect(xPostFrom(profile, { url: profile, title: "jack (@jack) on X", description: "bio" })).toBeNull();
});

it("canonicalPostUrl は oEmbed に渡す形へ揃える", () => {
  expect(canonicalPostUrl("https://www.twitter.com/jack/status/20?s=20")).toBe(
    "https://x.com/jack/status/20",
  );
  expect(canonicalPostUrl("https://x.com/jack/statuses/20/photo/1")).toBe("https://x.com/jack/status/20");
  expect(canonicalPostUrl("https://x.com/jack")).toBeNull();
});
