/**
 * ノート種別の視覚表示（#464 の残り）。ネイティブ NoteItem.kt 144–168 と同じ判定・スタイル。
 * 色そのものは designs/tokens.css の --kind-*（/-bg）。ここは種別の判定と、
 * どのスタイル（なし/縦ライン/背景色）を当てるかだけを持つ。
 */

/** 保存値（ネイティブ NoteAccentStyle.id、#468 の同期キー ui:note_accent と同じ形）。既定 none */
export type NoteAccentStyle = "none" | "line" | "bg";

/** 視覚表示の対象となるノート種別。色は designs/tokens.css の --kind-repost 等 */
export type NoteAccentKind = "repost" | "quote" | "reply" | "reaction";

export type NoteAccentInput = {
  /** リポスト（kind:6/16）として表示している行か */
  isRepost: boolean;
  /** 本文中の引用（note/nevent 参照 or q タグ）を持つか */
  hasQuote: boolean;
  /** リアクション（kind:7） */
  isReaction: boolean;
  /** 返信（NIP-10 / NIP-22 の親を持つ） */
  isReply: boolean;
};

/**
 * ノート種別の判定。リポスト > 引用 > リアクション > 返信 の優先順で最初に該当した1つを返す
 * （リポストされた引用など複数該当し得るため、外側の行為＝リポストを優先する）。
 * どれにも該当しなければ null（= アクセントを付けない）。
 */
export function noteAccentKindOf(input: NoteAccentInput): NoteAccentKind | null {
  if (input.isRepost) return "repost";
  if (input.hasQuote) return "quote";
  if (input.isReaction) return "reaction";
  if (input.isReply) return "reply";
  return null;
}
