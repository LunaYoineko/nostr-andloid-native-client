package app.nostrdeck.theme

import androidx.compose.ui.unit.dp
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * [#675] 廃人モードの寸法トークン。通常モードは今までの固定値そのまま（見た目を 1dp も変えない）、
 * 廃人モードは Web の tokens.css `:root[data-density="dense"]`（#674 / #695）と同じ値であることを固定する。
 */
class DeckDensityTest {

    @AfterTest
    fun reset() = DeckDensity.apply(false)

    @Test
    fun normal_mode_keeps_previous_fixed_values() {
        DeckDensity.apply(false)
        assertFalse(DeckDensity.isDense)
        assertEquals(DeckSpace.Sm, DeckDensity.ColumnGap)
        assertEquals(DeckSpace.Md, DeckDensity.NotePadX)
        assertEquals(DeckSpace.Md, DeckDensity.NotePadY)
        assertEquals(DeckSpace.Sm, DeckDensity.NoteGap)
        assertEquals(DeckDimens.TouchTargetSm, DeckDensity.ActionSize)
        assertEquals(DeckDimens.AvatarSize, DeckDensity.AvatarSize)
        // 本文⇔アクション行は従来の Md（12dp）のまま。
        assertEquals(DeckSpace.Md, DeckDensity.NoteGap + DeckDensity.ActionRowMy)
    }

    @Test
    fun dense_mode_matches_web_tokens() {
        DeckDensity.apply(true)
        assertTrue(DeckDensity.isDense)
        assertEquals(2.dp, DeckDensity.ColumnGap)
        assertEquals(8.dp, DeckDensity.NotePadX)
        assertEquals(8.dp, DeckDensity.NotePadY)
        assertEquals(4.dp, DeckDensity.NoteGap)
        assertEquals(28.dp, DeckDensity.ActionSize)
        assertEquals(0.dp, DeckDensity.ActionRowMy)
        assertEquals(28.dp, DeckDensity.AvatarSize)
    }

    @Test
    fun dense_action_buttons_keep_normal_center_spacing() {
        // [#695] 右寄せにしたボタンの中心間隔は通常（40 + 4 = 44dp）と同じ。詰めすぎない。
        DeckDensity.apply(true)
        assertEquals(DeckDimens.TouchTargetSm + DeckSpace.Xs, DeckDensity.ActionSize + DeckDensity.DenseActionGap)
        // タップ領域は 28dp 以上を保つ。
        assertTrue(DeckDensity.ActionSize >= 28.dp)
    }
}
