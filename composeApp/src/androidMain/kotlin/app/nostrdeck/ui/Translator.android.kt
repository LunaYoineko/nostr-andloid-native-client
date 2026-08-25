package app.nostrdeck.ui

import com.google.android.gms.tasks.Task
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.nl.languageid.LanguageIdentification
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

actual val translationSupported: Boolean = true

// [#356] kotlinx-coroutines-play-services を依存に足すほどではないので Task→suspend の橋渡しだけ持つ。
private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { cont ->
    addOnSuccessListener { cont.resume(it) }
    addOnFailureListener { cont.resumeWithException(it) }
    addOnCanceledListener { cont.cancel() }
}

actual suspend fun translateText(text: String, targetLanguage: String): String? {
    // 言語判定。"und"(判定不能)は fromLanguageTag が null を返すのでそこで落ちる。
    val srcTag = runCatching {
        val identifier = LanguageIdentification.getClient()
        try {
            identifier.identifyLanguage(text).await()
        } finally {
            identifier.close()
        }
    }.getOrNull() ?: return null
    val src = TranslateLanguage.fromLanguageTag(srcTag) ?: return null
    val dst = TranslateLanguage.fromLanguageTag(targetLanguage) ?: return null
    if (src == dst) return text
    val translator = Translation.getClient(
        TranslatorOptions.Builder().setSourceLanguage(src).setTargetLanguage(dst).build(),
    )
    return runCatching {
        try {
            // モデルは初回のみダウンロード。Wi-Fi 限定にすると「押したのに何も起きない」に
            // なるため条件は付けない(1言語 約30MB、以後はオフラインで動く)。
            translator.downloadModelIfNeeded(DownloadConditions.Builder().build()).await()
            translator.translate(text).await()
        } finally {
            translator.close()
        }
    }.getOrNull()
}
