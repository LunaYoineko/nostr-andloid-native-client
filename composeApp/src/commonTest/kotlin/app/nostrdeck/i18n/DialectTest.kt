package app.nostrdeck.i18n

import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** [#710] うにゅうと握手（関西弁 UI）の辞書の引き方。Web の resolveLocale / t() と同じ規則であることを固定する。 */
class DialectTest {

    @AfterTest
    fun reset() {
        Dialect.apply(false)
        Dialect.load(emptyMap())
    }

    private val dict = mapOf("common_cancel" to "やめとく", "relay_count_fmt" to "%1\$d 個のうち %2\$d 個つながってるで")

    @Test
    fun off_returns_null_so_standard_japanese_is_used() {
        Dialect.load(dict)
        assertNull(Dialect.lookup("common_cancel", "ja"))
    }

    @Test
    fun on_with_japanese_uses_the_dictionary() {
        Dialect.load(dict)
        Dialect.apply(true)
        assertEquals("やめとく", Dialect.lookup("common_cancel", "ja"))
    }

    @Test
    fun english_ui_is_never_kansai() {
        // Web と同じく、解決後の言語が ja のときだけ効く。
        Dialect.load(dict)
        Dialect.apply(true)
        assertNull(Dialect.lookup("common_cancel", "en"))
    }

    @Test
    fun keys_missing_from_the_sparse_dictionary_fall_back() {
        Dialect.load(dict)
        Dialect.apply(true)
        assertNull(Dialect.lookup("note_reply", "ja"))
    }

    @Test
    fun positional_args_are_filled_like_compose_resources() {
        assertEquals("3 個のうち 2 個つながってるで", dict.getValue("relay_count_fmt").withArgs(listOf("3", "2")))
        // 順番が入れ替わっていても位置で埋める。
        assertEquals("b と a", "%2\$s と %1\$s".withArgs(listOf("a", "b")))
        // 足りない引数はそのまま残す（落とさない）。
        assertEquals("a と %2\$s", "%1\$s と %2\$s".withArgs(listOf("a")))
    }

    @Test
    fun parse_reads_flat_json_object() {
        assertEquals(mapOf("a" to "あ", "b" to "い"), Dialect.parse("""{"a":"あ","b":"い"}"""))
    }
}
