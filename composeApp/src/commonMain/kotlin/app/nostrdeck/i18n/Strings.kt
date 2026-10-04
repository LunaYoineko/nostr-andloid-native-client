package app.nostrdeck.i18n

import androidx.compose.runtime.Composable
import androidx.compose.ui.text.intl.Locale
import org.jetbrains.compose.resources.StringResource

/*
 * [#710] 文言の取得。org.jetbrains.compose.resources の同名関数と同じ使い方で、関西弁（[Dialect]）が
 * 効いていれば辞書の文言に差し替える。アプリの文言はすべてこちらを import して使う
 * （Compose Resources の stringResource / getString を直接使うと関西弁にならない）。
 */

@Composable
fun stringResource(resource: StringResource): String {
    val base = org.jetbrains.compose.resources.stringResource(resource)
    return Dialect.lookup(resource.key, Locale.current.language) ?: base
}

@Composable
fun stringResource(resource: StringResource, vararg formatArgs: Any): String {
    val base = org.jetbrains.compose.resources.stringResource(resource, *formatArgs)
    return Dialect.lookup(resource.key, Locale.current.language)
        ?.withArgs(formatArgs.map { it.toString() }) ?: base
}

suspend fun getString(resource: StringResource): String =
    Dialect.lookup(resource.key, Locale.current.language)
        ?: org.jetbrains.compose.resources.getString(resource)

suspend fun getString(resource: StringResource, vararg formatArgs: Any): String =
    Dialect.lookup(resource.key, Locale.current.language)?.withArgs(formatArgs.map { it.toString() })
        ?: org.jetbrains.compose.resources.getString(resource, *formatArgs)
