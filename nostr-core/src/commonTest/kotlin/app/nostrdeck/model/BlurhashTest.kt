package app.nostrdeck.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** [#140] blurhash デコーダ。公式デモ（blurha.sh）のサンプルハッシュで検証。 */
class BlurhashTest {
    @Test
    fun decodesSampleHash() {
        // blurha.sh のサンプル（4x3 コンポーネント）。
        val px = Blurhash.decode("LEHV6nWB2yk8pyo0adR*.7kCMdnj", 32, 32)
        checkNotNull(px)
        assertEquals(32 * 32, px.size)
        // 全ピクセル不透明。
        assertTrue(px.all { (it ushr 24) == 255 })
        // ぼかし画像として色に変化がある（単色でない）。
        assertTrue(px.distinct().size > 16)
    }

    @Test
    fun rejectsBrokenInput() {
        assertNull(Blurhash.decode("", 16, 16))
        assertNull(Blurhash.decode("LEHV6nWB2yk8pyo0adR*.7kCMdn", 16, 16))   // 長さ不一致
        assertNull(Blurhash.decode("LEHV6nWB2yk8pyo0adR*.7kCMdn\"", 16, 16)) // 不正文字
        assertNull(Blurhash.decode("LEHV6nWB2yk8pyo0adR*.7kCMdnj", 0, 16))
    }
}
