package app.nostrdeck.ui

import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** [#277] Skia Codec によるアニメGIFデコード（iOS と同一実装のデスクトップ側で検証）。 */
@OptIn(ExperimentalEncodingApi::class)
class EmojiFramesTest {
    // 2x2・2フレーム（赤→青、100ms/200ms）の手組みアニメGIF。
    private val twoFrameGif =
        "R0lGODlhAgACAPAAAP8AAAAA/yH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAgACAAACBARBEAUAIfkEABQAAAAsAAAAAAIAAgAAAgQMwzAFADs="

    @Test
    fun decodesAnimatedGifFrames() {
        val frames = EmojiFrameCache.decode(Base64.decode(twoFrameGif))
        checkNotNull(frames)
        assertEquals(2, frames.frames.size)
        assertEquals(2, frames.durationsMs.size)
        assertTrue(frames.durationsMs.all { it > 0 })
        assertEquals(2, frames.frames[0].width)
        assertEquals(2, frames.frames[0].height)
    }

    @Test
    fun rejectsBrokenBytes() {
        assertNull(EmojiFrameCache.decode(ByteArray(0)))
        assertNull(EmojiFrameCache.decode(byteArrayOf(1, 2, 3, 4)))
    }
}
