import { create } from "zustand";

/** 値は EmbedPrefs（欠けている・壊れている項目は既定へ）。ネイティブ nostr-core Embed.kt の EmbedPrefs と同じ形 */
export const EMBED_PREFS_KEY = "nostrism.embed";

/**
 * 本文中のリンクの埋め込み表示（設定 > 表示の「リンクの埋め込み表示」）。
 *  - video/youtube/spotify/ogp: それぞれの埋め込みを出すか
 *  - ogpImages: OGP カードで画像を読み込むか（Spotify は常に読む。設定に関係ない）
 *  - hideCardedUrls: カード / プレイヤーを出した URL（OGP・YouTube・Spotify）を本文から畳むか
 */
export type EmbedPrefs = {
  video: boolean;
  youtube: boolean;
  spotify: boolean;
  ogp: boolean;
  ogpImages: boolean;
  hideCardedUrls: boolean;
};

/** 既定は全て true（ネイティブの EmbedPrefs と同じ） */
export const DEFAULT_EMBED_PREFS: EmbedPrefs = {
  video: true,
  youtube: true,
  spotify: true,
  ogp: true,
  ogpImages: true,
  hideCardedUrls: true,
};

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** 無い・壊れている項目は既定へ（項目ごと） */
function readEmbedPrefs(): EmbedPrefs {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(EMBED_PREFS_KEY) ?? "null");
    if (typeof value === "object" && value !== null) {
      const v = value as Record<string, unknown>;
      return {
        video: readBool(v.video, DEFAULT_EMBED_PREFS.video),
        youtube: readBool(v.youtube, DEFAULT_EMBED_PREFS.youtube),
        spotify: readBool(v.spotify, DEFAULT_EMBED_PREFS.spotify),
        ogp: readBool(v.ogp, DEFAULT_EMBED_PREFS.ogp),
        ogpImages: readBool(v.ogpImages, DEFAULT_EMBED_PREFS.ogpImages),
        hideCardedUrls: readBool(v.hideCardedUrls, DEFAULT_EMBED_PREFS.hideCardedUrls),
      };
    }
  } catch {
    // 壊れた保存値は既定へ
  }
  return DEFAULT_EMBED_PREFS;
}

/** 埋め込み表示の設定（設定 > 表示） */
export const useEmbedPrefs = create<EmbedPrefs>()(() => readEmbedPrefs());

/** 1 項目を変えて保存する（設定画面のトグルから） */
export function setEmbedPref<K extends keyof EmbedPrefs>(key: K, value: EmbedPrefs[K]): void {
  useEmbedPrefs.setState({ [key]: value } as Pick<EmbedPrefs, K>);
  try {
    localStorage.setItem(EMBED_PREFS_KEY, JSON.stringify(useEmbedPrefs.getState()));
  } catch {
    // 保存できなくてもこのセッションでは効く
  }
}
