package app.nostrdeck.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** [#264] テーマ共有コードとバージョン比較の検証。 */
class ThemeEntryTest {

    private val sakura = ThemeEntry(
        name = "Sakura",
        colors = CustomThemePrefs(0xFFFDF3F5.toInt(), 0xFF2A1E22.toInt(), 0xFFC2557A.toInt()),
        minAppVersion = "0.3.0",
    )

    @Test
    fun code_roundtrips() {
        val code = ThemeEntry.encodeCode(sakura)
        assertEquals("nostrism-theme:1:Sakura:FDF3F5,2A1E22,C2557A:0.3.0", code)
        val back = ThemeEntry.decodeCode(code)!!
        assertEquals(sakura.name, back.name)
        assertEquals(sakura.colors, back.colors)
        assertEquals(sakura.minAppVersion, back.minAppVersion)
        assertEquals(sakura.schema, back.schema)
    }

    @Test
    fun code_accepts_hash_prefixed_and_missing_version() {
        val e = ThemeEntry.decodeCode("nostrism-theme:1:Mono:#000000,#FFFFFF,#FF0000")!!
        assertEquals("Mono", e.name)
        assertEquals(0xFF000000.toInt(), e.colors.bg)
        assertEquals(0xFFFF0000.toInt(), e.colors.accent)
        assertEquals("0.3.0", e.minAppVersion)   // 省略時は既定
    }

    @Test
    fun code_rejects_broken_input() {
        assertNull(ThemeEntry.decodeCode(""))
        assertNull(ThemeEntry.decodeCode("nope:1:X:000000,FFFFFF,FF0000"))          // 別アプリ
        assertNull(ThemeEntry.decodeCode("nostrism-theme:1:X:000000,FFFFFF"))       // 色が2つ
        assertNull(ThemeEntry.decodeCode("nostrism-theme:1:X:GGGGGG,FFFFFF,FF0000"))// 不正な hex
        assertNull(ThemeEntry.decodeCode("nostrism-theme:1::000000,FFFFFF,FF0000")) // 名前なし
    }

    @Test
    fun name_with_colon_is_sanitized() {
        val e = sakura.copy(name = "Dark:Mode")
        val back = ThemeEntry.decodeCode(ThemeEntry.encodeCode(e))!!
        assertEquals("Dark-Mode", back.name)
    }

    @Test
    fun slug_is_url_safe() {
        assertEquals("sakura", sakura.slug())
        assertEquals("dark-mode", sakura.copy(name = "Dark Mode").slug())
        assertEquals("theme", sakura.copy(name = "  ").slug())
        assertEquals("mono-2", sakura.copy(name = "Mono 2").slug())
    }

    @Test
    fun version_comparison() {
        assertTrue(ThemeEntry.isOlderThan("0.3.0", "0.4.0"))    // アプリが古い
        assertTrue(ThemeEntry.isOlderThan("0.3.9", "0.4.0"))
        assertTrue(ThemeEntry.isOlderThan("1.0.0", "1.0.1"))
        assertFalse(ThemeEntry.isOlderThan("0.4.0", "0.4.0"))   // 同じ
        assertFalse(ThemeEntry.isOlderThan("0.5.0", "0.4.0"))   // アプリが新しい
        assertFalse(ThemeEntry.isOlderThan("1.0.0", "0.9.9"))
        // 数値以外の要素は無視して数値部で比較する
        assertFalse(ThemeEntry.isOlderThan("0.4.0-beta.436", "0.4.0"))
        assertTrue(ThemeEntry.isOlderThan("0.3.0-beta.436", "0.4.0"))
        // 桁数が違っても比較できる
        assertFalse(ThemeEntry.isOlderThan("0.4", "0.4.0"))
        assertTrue(ThemeEntry.isOlderThan("0.4", "0.4.1"))
    }
}
