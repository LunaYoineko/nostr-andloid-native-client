package app.nostrdeck.ui

/**
 * [#224] 実行プラットフォームが iOS かどうか。
 * ピッカー復帰後のキーボード復帰戦略（iOS はフォーカスサイクル / Android は show() リトライ）の
 * 分岐に使う。UI 挙動の分岐以外には使わないこと（機能分岐は expect/actual で行う）。
 */
expect val isIosPlatform: Boolean

/**
 * [#264] アプリの表示バージョン（"0.3.0"）。配布テーマの minAppVersion 判定に使う。
 * 取得できない場合は "0.0.0"（＝常に「古い」と判定され警告が出る安全側）。
 */
expect val appVersionName: String
