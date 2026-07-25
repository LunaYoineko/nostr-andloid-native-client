package app.nostrdeck.ui

actual val isIosPlatform: Boolean = true

// [#264] Info.plist の CFBundleShortVersionString（MARKETING_VERSION）。
actual val appVersionName: String =
    platform.Foundation.NSBundle.mainBundle.objectForInfoDictionaryKey("CFBundleShortVersionString") as? String
        ?: "0.0.0"
