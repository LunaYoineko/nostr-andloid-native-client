package app.nostrdeck.nostr

import kotlin.test.Test
import kotlin.test.assertEquals

/** [#365] 再接続時の since 差し込み（applySinceForResend）の仕様を固定する。 */
class ApplySinceForResendTest {

    private val stream = Filter(kinds = listOf(1), limit = 100)

    @Test
    fun 受信済みがあればsinceをマージン付きで差し込む() {
        val out = applySinceForResend(listOf(stream), lastEventAt = 1_000_000, marginSec = 60)
        assertEquals(999_940L, out.single().since)
        assertEquals(100, out.single().limit)   // limit は安全上限として残す
    }

    @Test
    fun 受信記録が無ければ従来どおり全量() {
        val out = applySinceForResend(listOf(stream), lastEventAt = null)
        assertEquals(listOf(stream), out)
    }

    @Test
    fun 明示されたsinceやuntilは上書きしない() {
        val pinned = Filter(kinds = listOf(1), since = 123L)
        val ranged = Filter(kinds = listOf(1), until = 456L)
        val out = applySinceForResend(listOf(pinned, ranged, stream), lastEventAt = 1_000_000, marginSec = 60)
        assertEquals(123L, out[0].since)
        assertEquals(456L, out[1].until)
        assertEquals(null, out[1].since)
        assertEquals(999_940L, out[2].since)
    }

    @Test
    fun マージンが受信時刻を上回っても負にならない() {
        val out = applySinceForResend(listOf(stream), lastEventAt = 30, marginSec = 60)
        assertEquals(0L, out.single().since)
    }
}
