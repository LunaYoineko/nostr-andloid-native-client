package app.nostrdeck.i18n

import androidx.compose.runtime.mutableStateOf
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/**
 * [#710] 「うにゅうと握手」（関西弁 UI）。日本語表示のときだけ、関西弁の辞書にあるキーの文言を差し替える。
 * 辞書は Web と共通の `ja-kansai.json`（正は web/src/i18n。scripts/sync-kansai-dict.sh で写す）で、
 * 違うキーだけを持つ疎な辞書。無いキーは日本語のまま。この端末の表示だけの演出で、投稿内容には関係しない。
 *
 * DeckWeight / Nyan と同じく snapshot state で持つので、切り替えると読んでいる画面がすべて再コンポーズされる。
 * 文言の取得は [stringResource] / [getString]（このパッケージ）を通す。
 */
object Dialect {
    /** 同梱の辞書の場所（`Res.readBytes` に渡すパス。composeResources/files/ja-kansai.json） */
    const val DICT_PATH = "files/ja-kansai.json"

    private val enabled = mutableStateOf(false)
    private val dict = mutableStateOf<Map<String, String>>(emptyMap())

    /** App が設定 Flow から呼ぶ。値が変わる時のみ代入（DeckWeight.apply と同じ作法）。 */
    fun apply(on: Boolean) { if (enabled.value != on) enabled.value = on }

    /** 起動時に同梱の辞書を読み込んで渡す。 */
    fun load(map: Map<String, String>) { dict.value = map }

    /**
     * 差し替え後の文言（引数を埋める前のひな形）。関西弁がオフ・表示言語が日本語以外・辞書に無いキーは null
     * （呼び出し側は通常の文言を使う）。Web の resolveLocale と同じく、英語表示のときは効かない。
     */
    fun lookup(key: String, language: String): String? =
        if (enabled.value && language == "ja") dict.value[key] else null

    private val json = Json { ignoreUnknownKeys = true }

    fun parse(text: String): Map<String, String> =
        json.decodeFromString(MapSerializer(String.serializer(), String.serializer()), text)
}

private val PositionalArg = Regex("""%(\d+)\$[ds]""")

/** Compose Resources と同じ規則（`%1$s` / `%2$d` の位置指定）で引数を埋める。 */
internal fun String.withArgs(args: List<String>): String =
    PositionalArg.replace(this) { m -> args.getOrNull(m.groupValues[1].toInt() - 1) ?: m.value }
