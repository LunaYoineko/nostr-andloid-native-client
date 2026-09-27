/**
 * OGP の解析（ネイティブ EventRepository.fetchOgp の解析部分の移植）。/api/og が返す HTML 先頭を読む純関数。
 * DOMParser で組んだ文書はスクリプトを実行せず、画像等も読み込まない。
 */

/** OGP の中身（ネイティブ nostr-core Embed.kt の OgpData）。取れた項目だけを持つ。url は投稿に書かれた URL */
export type OgpData = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

/** Amazon の商品ページか（ネイティブ EventRepository.isAmazonUrl と同じ） */
export function isAmazonUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?amazon\.[a-z.]+\//i.test(url) || /^https?:\/\/amzn\.(to|asia)\//i.test(url);
}

/** <meta charset="…"> と <meta http-equiv="Content-Type" content="…; charset=…"> の両方 */
const META_CHARSET = /<meta\b[^>]*?\bcharset\s*=\s*["']?\s*([A-Za-z0-9_.:-]+)/i;
/** Content-Type ヘッダの charset */
const HEADER_CHARSET = /;\s*charset\s*=\s*"?([^";\s]+)/i;

/** label の TextDecoder。知らない名前なら null */
function decoderFor(label: string | undefined, fromMeta: boolean): TextDecoder | null {
  if (!label) return null;
  try {
    const decoder = new TextDecoder(label);
    // <meta> で UTF-16 を名乗る文書は ASCII 互換で書かれているので UTF-8 として読む（HTML 仕様の prescan と同じ）
    return fromMeta && decoder.encoding.startsWith("utf-16") ? new TextDecoder("utf-8") : decoder;
  } catch {
    return null;
  }
}

/**
 * /api/og の応答本文を文字列にする。文字コードは <meta charset>（</head> まで）→ upstream の Content-Type の
 * charset → UTF-8 の順に決める（/api/og は文字コードを変換せずに返す）。
 */
export function decodeHtml(body: ArrayBuffer, upstreamContentType: string | null): string {
  const bytes = new Uint8Array(body);
  // ASCII の範囲だけ読めればよいので 1 バイト = 1 文字で読む
  const ascii = new TextDecoder("windows-1252").decode(bytes);
  const headEnd = ascii.search(/<\/head\s*>/i);
  const head = headEnd < 0 ? ascii : ascii.slice(0, headEnd);
  const decoder =
    decoderFor(META_CHARSET.exec(head)?.[1], true) ??
    decoderFor(HEADER_CHARSET.exec(upstreamContentType ?? "")?.[1], false) ??
    new TextDecoder("utf-8");
  return decoder.decode(bytes);
}

/** 画像 URL を最終 URL 基準で絶対 URL にする。http(s) 以外・解決できないものは undefined */
function resolveImage(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Amazon は OG タグを載せないので、商品ページの画像フィールドから補う（ネイティブと同じ 3 つを順に）。
 * 画像の JSON はページ後半に来ることがあるので、文書ではなく本文全体を見る。
 */
function amazonImage(html: string): string | undefined {
  return (
    /"hiRes"\s*:\s*"(https:[^"]+)"/.exec(html)?.[1] ??
    /id="landingImage"[^>]*\bsrc="(https:[^"]+)"/.exec(html)?.[1] ??
    /"large"\s*:\s*"(https:[^"]+)"/.exec(html)?.[1]
  );
}

/**
 * HTML から OGP を取り出す。
 * - title: og:title → twitter:title → <title>
 * - description: og:description → twitter:description → meta[name=description]
 * - image: og:image → og:image:url → og:image:secure_url → twitter:image → twitter:image:src（相対 URL は finalUrl 基準）、
 *   Amazon で無ければ商品画像
 * - siteName: og:site_name
 * タイトルも画像も取れなければ null（カードにしない。ネイティブと同じ）。
 */
export function parseOgp(html: string, url: string, finalUrl: string = url): OgpData | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // property / name のどちらでも、最初に出たものを使う（大文字小文字は無視）
  const metas = new Map<string, string>();
  for (const meta of doc.querySelectorAll("meta")) {
    const content = meta.getAttribute("content")?.trim();
    if (!content) continue;
    for (const attr of ["property", "name"]) {
      const key = meta.getAttribute(attr)?.trim().toLowerCase();
      if (key && !metas.has(key)) metas.set(key, content);
    }
  }
  const pick = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = metas.get(key);
      if (value) return value;
    }
    return undefined;
  };

  const title = pick("og:title", "twitter:title") ?? (doc.title.trim() || undefined);
  const image =
    resolveImage(
      pick("og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"),
      finalUrl,
    ) ?? (isAmazonUrl(url) || isAmazonUrl(finalUrl) ? amazonImage(html) : undefined);
  if (!title && !image) return null;

  const data: OgpData = { url };
  if (title) data.title = title;
  const description = pick("og:description", "twitter:description", "description");
  if (description) data.description = description;
  if (image) data.image = image;
  const siteName = pick("og:site_name");
  if (siteName) data.siteName = siteName;
  return data;
}
