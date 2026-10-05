/**
 * X（Twitter）の投稿カードの中身（ネイティブ XPost.kt の XPost / XPosts の移植。#733 / #744）。
 * x.com の OGP（title / description / image）から組み立てる純関数。
 *
 * x.com は投稿ページの OGP に、題名＝著者名と @ハンドル、説明＝本文（改行つき）、画像＝写真の 1 枚目
 * （写真が無ければプロフィール画像）を返す。写真は 1 枚目だけ・動画はサムネのみ。日時は OGP に無いので
 * 公式 oEmbed から（dateFromOembedHtml）、写真付きの投稿のアイコンはプロフィールページの OGP から取る。
 */
import type { OgpData } from "./ogpParser";

export type XPost = {
  url: string;
  /** 表示名。題名から読めなければ null（ハンドルだけ出す） */
  name: string | null;
  /** @ を除いたハンドル */
  handle: string;
  /** 本文（改行は OGP のまま） */
  text: string;
  /** 写真（1 枚目）。無ければ null */
  image: string | null;
  /** プロフィール画像。写真がある投稿では OGP に載らないので null のことが多い */
  avatar: string | null;
};

const POST_URL =
  /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d+)/i;
// 題名の形は X の表示言語（Accept-Language）で変わる。
//   en: "jack (@jack) on X" / 旧 "jack (@jack) on Twitter" / "jack (@jack) / X"
//   ja: "Xユーザーのjack（@jack）さん"
const TITLE_EN = /^(.*?)\s*\(@([A-Za-z0-9_]{1,15})\)\s*(?:on X|on Twitter|\/ X|\/ Twitter)\s*$/s;
const TITLE_JA = /^Xユーザーの(.*?)（@([A-Za-z0-9_]{1,15})）さん$/s;
// 削除済み・非公開・存在しない投稿で x.com が本文の代わりに返す文。これなら投稿は取れていない。
const NOT_FOUND = [
  "could not be found",
  "may have been deleted",
  "doesn't exist",
  "見つかりません",
  "削除された",
  "存在しません",
];

/**
 * 公式 oEmbed（publish.x.com）の html から投稿日時の文字列を取る。blockquote の末尾のリンク
 * （`… <a href="https://x.com/u/status/1?ref_src=…">2026年10月4日</a></blockquote>`）の中身で、
 * 言語は oEmbed の lang に従う（ja なら「2026年10月4日」、en なら「October 4, 2026」）。無ければ null。
 */
export function dateFromOembedHtml(html: string): string | null {
  const match = />([^<>]+)<\/a>\s*<\/blockquote>/.exec(html);
  if (!match) return null;
  const date = match[1].trim().replaceAll("&amp;", "&").replaceAll("&nbsp;", " ");
  return date === "" ? null : date;
}

/** 投稿者のプロフィールページの URL（アイコンをプロフィールの OGP から取るため） */
export function profileUrl(handle: string): string {
  return `https://x.com/${handle}`;
}

/** OGP の画像がプロフィール画像（`/profile_images/`）か */
export function isProfileImage(url: string | null | undefined): boolean {
  return url?.includes("/profile_images/") === true;
}

/** X / Twitter の投稿（status）URL か。プロフィールやホーム等は対象外 */
export function isPostUrl(url: string): boolean {
  return POST_URL.test(url.trim());
}

/** URL のパスからハンドルを取る（題名が読めないときの保険） */
export function handleFromUrl(url: string): string | null {
  return POST_URL.exec(url.trim())?.[1] ?? null;
}

/**
 * oEmbed に渡す正規化した投稿 URL（`https://x.com/<handle>/status/<id>`）。/photo/1 や ?s=20 等を落とす。
 * 投稿 URL でなければ null。
 */
export function canonicalPostUrl(url: string): string | null {
  const m = POST_URL.exec(url.trim());
  return m ? `https://x.com/${m[1]}/status/${m[2]}` : null;
}

/** 題名から [表示名, ハンドル]。形が合わなければ null */
export function parseTitle(title: string): [name: string, handle: string] | null {
  const t = title.trim();
  const m = TITLE_JA.exec(t) ?? TITLE_EN.exec(t);
  return m ? [m[1].trim(), m[2]] : null;
}

/**
 * OGP から投稿カードを組み立てる。本文が取れていない（OGP 失敗・削除済み・空）なら null を返し、
 * 呼び出し側は従来のリンクカードに落とす。
 */
export function xPostFrom(url: string, ogp: OgpData | null | undefined): XPost | null {
  if (!ogp || !isPostUrl(url)) return null;
  const text = ogp.description?.trim() ?? "";
  const lower = text.toLowerCase();
  if (text === "" || NOT_FOUND.some((s) => lower.includes(s.toLowerCase()))) return null;
  const parsed = ogp.title ? parseTitle(ogp.title) : null;
  const handle = parsed?.[1] ?? handleFromUrl(url);
  if (!handle) return null;
  const img = ogp.image && ogp.image.trim() !== "" ? ogp.image : null;
  const isAvatar = isProfileImage(img);
  return {
    url,
    name: parsed?.[0] ? parsed[0] : null,
    handle,
    text,
    image: isAvatar ? null : img,
    avatar: isAvatar ? img : null,
  };
}
