package app.nostrdeck.model

import kotlin.test.Test
import kotlin.test.assertEquals

/** [#378] にゃいず変換（Misskey 相当の標準置換）の検証。 */
class NyaizeTest {

    @Test
    fun japanese_na_row() {
        assertEquals("こんにちは、みんにゃ", nyaize("こんにちは、みんな"))
        assertEquals("ニャイス", nyaize("ナイス"))
        assertEquals("ﾆｬﾝﾃﾞｽﾄ", nyaize("ﾅﾝﾃﾞｽﾄ"))
        // 複数出現もすべて置換される。
        assertEquals("にゃかにゃか", nyaize("なかなか"))
    }

    @Test
    fun english_na() {
        assertEquals("banyanya", nyaize("banana"))
        assertEquals("NYASA", nyaize("NASA"))
        assertEquals("Nyagoya", nyaize("Nagoya"))
        // nA のような混在ケースは対象外（Misskey 相当）。
        assertEquals("nA", nyaize("nA"))
    }

    @Test
    fun untouched_text_passes_through() {
        assertEquals("", nyaize(""))
        assertEquals("にゃんこ🐱 123 abc", nyaize("にゃんこ🐱 123 abc"))
        assertEquals("ハッシュ#tagは呼び出し側で除外する", nyaize("ハッシュ#tagは呼び出し側で除外する"))
    }

    @Test
    fun mixed_sentence() {
        assertEquals(
            "今日はいい天気だにゃあ。Nyach banyanya NYAIL",
            nyaize("今日はいい天気だなあ。Nach banana NAIL"),
        )
    }

    @Test
    fun nyan_mode_from_id() {
        assertEquals(NyanMode.OFF, NyanMode.fromId(null))
        assertEquals(NyanMode.OFF, NyanMode.fromId("unknown"))
        assertEquals(NyanMode.SELF, NyanMode.fromId("self"))
        assertEquals(NyanMode.ALL, NyanMode.fromId("all"))
    }
}
