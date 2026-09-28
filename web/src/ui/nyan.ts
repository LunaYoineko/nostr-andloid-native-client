import { create } from "zustand";
import { useSession } from "../signer/session";

/**
 * [#540] にゃにゃにゃウイルス（設定 > 表示）。ネイティブ nostr-core Appearance.kt の NyanMode の移植。
 * off = オフ、self = 自分の投稿・アバターだけ、all = 全員。**完全に表示だけの演出**で、
 * 発行するイベントの本文には絶対に適用しないこと。
 */
export type NyanMode = "off" | "self" | "all";

/** 値は NyanMode の文字列そのまま。NIP-78 の同期には入れない（ネイティブも端末ローカル） */
export const NYAN_MODE_KEY = "nostrism.nyanMode";

function readNyanMode(): NyanMode {
  try {
    const v = localStorage.getItem(NYAN_MODE_KEY);
    if (v === "self" || v === "all") return v;
  } catch {
    // 壊れた保存値は既定（オフ）へ
  }
  return "off";
}

/** にゃんモードの設定値（設定 > 表示の選択肢） */
export const useNyanMode = create<{ mode: NyanMode }>()(() => ({ mode: readNyanMode() }));

/** にゃんモードを変える（設定画面から） */
export function setNyanMode(mode: NyanMode): void {
  useNyanMode.setState({ mode });
  try {
    localStorage.setItem(NYAN_MODE_KEY, mode);
  } catch {
    // 保存できなくてもこのセッションでは効く
  }
}

/**
 * pubkey（hex。分かる呼び出し元だけが渡す）の表示を猫化するか（ネイティブ Nyan.appliesTo の移植）。
 *  - all : 常に true（pubkey 不明の表示箇所にも効く）
 *  - self: ログイン中の自分の pubkey と一致するときだけ true
 *  - off : false
 * コンポーネント内で使うフック。モード・自分の pubkey が変わると自動で再描画される。
 */
export function useNyanApplies(pubkey: string | undefined): boolean {
  const mode = useNyanMode((s) => s.mode);
  const me = useSession((s) => s.pubkey);
  if (mode === "off") return false;
  if (mode === "all") return true;
  return pubkey !== undefined && pubkey === me;
}

/**
 * 本文の「にゃいず」変換（Misskey 相当の標準置換。nostr-core Nyaize.kt の移植）。
 * 呼び出し側はトークン化後のプレーンテキスト断片だけに掛けること
 * （生文字列に掛けると URL・npub・#タグ・:shortcode: の参照が壊れるため、この関数自体は
 * 「渡された文字列を機械的に置換するだけ」の純関数にしてある）。
 *
 * 置換規則: な→にゃ / ナ→ニャ / ﾅ→ﾆｬ / na→nya / NA→NYA / Na→Nya（nA のような混在は対象外）
 */
export function nyaize(text: string): string {
  return text
    .replaceAll("な", "にゃ")
    .replaceAll("ナ", "ニャ")
    .replaceAll("ﾅ", "ﾆｬ")
    .replaceAll("na", "nya")
    .replaceAll("NA", "NYA")
    .replaceAll("Na", "Nya");
}
