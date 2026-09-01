package app.nostrdeck.model

/**
 * [#378] にゃにゃにゃウイルス: 本文の「にゃいず」変換（Misskey の猫モード相当の標準置換）。
 *
 * **完全にローカル表示のみ**の演出であり、リレーへ発行するイベントには一切適用しないこと。
 * 適用箇所はトークン化後のプレーンテキスト断片だけ（[app.nostrdeck.ui] の noteAnnotated 側）。
 * トークン化前の生文字列に掛けると URL / npub / #タグ / :shortcode: の参照が壊れるため、
 * この関数自体は「渡された文字列を機械的に置換するだけ」の純関数にしてある。
 *
 * 置換規則:
 *  - 日本語: な→にゃ / ナ→ニャ / ﾅ→ﾆｬ
 *  - 英語  : na→nya / NA→NYA / Na→Nya（単語中も置換。nA のような混在は対象外）
 */
fun nyaize(text: String): String = text
    .replace("な", "にゃ")
    .replace("ナ", "ニャ")
    .replace("ﾅ", "ﾆｬ")
    .replace("na", "nya")
    .replace("NA", "NYA")
    .replace("Na", "Nya")
