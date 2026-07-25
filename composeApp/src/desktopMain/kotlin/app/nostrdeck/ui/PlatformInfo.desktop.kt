package app.nostrdeck.ui

actual val isIosPlatform: Boolean = false

// [#264] Desktop は packageVersion を持たないため実行時に取得できない。警告側に倒す。
actual val appVersionName: String = "0.0.0"
