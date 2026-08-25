package app.nostrdeck.ui

// [#356] Desktop(JVM) は当面非対応(メニュー項目自体を出さない)。
actual val translationSupported: Boolean = false

actual suspend fun translateText(text: String, targetLanguage: String): String? = null
