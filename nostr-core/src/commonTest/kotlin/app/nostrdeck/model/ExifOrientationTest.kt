package app.nostrdeck.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** [#322] EXIF Orientation → 焼き込む変換。8値すべてを固定する。 */
class ExifOrientationTest {

    @Test
    fun upright_and_unset_are_identity() {
        // 1=正立。0 は「タグ無し」で読み手が入れる既定値。どちらも画素を触らない。
        assertTrue(exifOrientationToTransform(1).isIdentity)
        assertTrue(exifOrientationToTransform(0).isIdentity)
    }

    @Test
    fun unknown_values_fall_back_to_identity() {
        // 壊れたファイルで想定外の値が来ても、勝手に回さない（回すほうが被害が大きい）。
        assertTrue(exifOrientationToTransform(9).isIdentity)
        assertTrue(exifOrientationToTransform(-1).isIdentity)
    }

    @Test
    fun portrait_photo_rotates_90_clockwise() {
        // 縦持ちで撮った写真の大半がこれ。ここが効かないと横倒しで投稿される。
        val t = exifOrientationToTransform(6)
        assertEquals(90, t.rotationDegrees)
        assertFalse(t.mirrored)
        assertTrue(t.swapsAxes, "90度回転なので幅と高さが入れ替わる")
    }

    @Test
    fun all_eight_values_map_as_specified() {
        assertEquals(ImageTransform(0, false), exifOrientationToTransform(1))
        assertEquals(ImageTransform(0, true), exifOrientationToTransform(2))
        assertEquals(ImageTransform(180, false), exifOrientationToTransform(3))
        assertEquals(ImageTransform(180, true), exifOrientationToTransform(4))
        assertEquals(ImageTransform(90, true), exifOrientationToTransform(5))
        assertEquals(ImageTransform(90, false), exifOrientationToTransform(6))
        assertEquals(ImageTransform(270, true), exifOrientationToTransform(7))
        assertEquals(ImageTransform(270, false), exifOrientationToTransform(8))
    }

    @Test
    fun only_quarter_turns_swap_axes() {
        listOf(1, 2, 3, 4).forEach {
            assertFalse(exifOrientationToTransform(it).swapsAxes, "exif=$it は縦横が入れ替わらない")
        }
        listOf(5, 6, 7, 8).forEach {
            assertTrue(exifOrientationToTransform(it).swapsAxes, "exif=$it は縦横が入れ替わる")
        }
    }

    @Test
    fun mirrored_values_are_the_even_ones() {
        // 偶数側（2/4/5/7 のうち EXIF 定義で反転を含むもの）だけが mirrored。
        listOf(2, 4, 5, 7).forEach { assertTrue(exifOrientationToTransform(it).mirrored, "exif=$it") }
        listOf(1, 3, 6, 8).forEach { assertFalse(exifOrientationToTransform(it).mirrored, "exif=$it") }
    }
}
