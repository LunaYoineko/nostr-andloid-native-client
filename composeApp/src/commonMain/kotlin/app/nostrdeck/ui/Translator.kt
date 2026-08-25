package app.nostrdeck.ui

/**
 * [#356] 投稿本文のオンデバイス翻訳。
 * Android のみ ML Kit(翻訳・言語判定)で対応。本文を外部サーバーへ送らず、
 * 言語モデル(約30MB/言語)は初回利用時に端末へダウンロードされる。
 * 非対応プラットフォームでは [translationSupported] が false になり、メニュー項目自体を出さない。
 */
expect val translationSupported: Boolean

/**
 * [text] を [targetLanguage](BCP-47 言語コード。例 "ja")へ翻訳する。
 * 翻訳元言語は本文から自動判定する。判定不能・未対応言語・モデル取得失敗などは null。
 * 判定した言語が [targetLanguage] と同じときは原文をそのまま返す。
 */
expect suspend fun translateText(text: String, targetLanguage: String): String?
