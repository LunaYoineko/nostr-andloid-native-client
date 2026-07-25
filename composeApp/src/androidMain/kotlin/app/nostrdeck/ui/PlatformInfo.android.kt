package app.nostrdeck.ui

actual val isIosPlatform: Boolean = false

// [#264] BuildConfig.VERSION_NAME（Gradle が git tag 由来で埋める）。
actual val appVersionName: String = app.nostrdeck.BuildConfig.VERSION_NAME
