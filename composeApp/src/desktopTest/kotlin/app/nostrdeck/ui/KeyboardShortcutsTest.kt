package app.nostrdeck.ui

import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import app.nostrdeck.model.ColumnKind
import app.nostrdeck.model.ColumnRenderer
import app.nostrdeck.model.ColumnSpec
import app.nostrdeck.model.ReqFilter
import app.nostrdeck.state.DeckState
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * [#275] キーボードショートカットの KeyDown/KeyUp 両取り。
 * macOS の日本語IME中は文字キーの KeyDown が IME に吸われて KeyUp しか届かないため、
 * 「Down で発火＋Up は無音消費」「Down が来なければ Up で発火」を検証する。
 */
class KeyboardShortcutsTest {

    private fun newState() = DeckState(
        listOf(
            ColumnSpec(
                id = "c1", title = "t", subtitle = "",
                kind = ColumnKind.FOLLOWING, renderer = ColumnRenderer.FEED, filter = ReqFilter(),
            ),
        ),
    )

    // KeyEvent の合成ファクトリは compose-ui 内部 API 扱い（テスト用途のみで使用）。
    @OptIn(androidx.compose.ui.InternalComposeUiApi::class)
    private fun key(type: KeyEventType, key: Key, char: Char): KeyEvent =
        KeyEvent(key = key, type = type, codePoint = char.code)

    @Test
    fun downFiresAndMatchingUpIsSwallowed() {
        val s = newState()
        // KeyDown で発火（n = 新規投稿）。
        assertTrue(handleDeckKey(s, key(KeyEventType.KeyDown, Key.N, 'n')))
        assertTrue(s.showCompose)
        // 対応する KeyUp は「消費するが再発火しない」（閉じた直後に再度開いてしまわない）。
        s.showCompose = false
        assertTrue(handleDeckKey(s, key(KeyEventType.KeyUp, Key.N, 'n')))
        assertFalse(s.showCompose)
    }

    @Test
    fun upOnlyFiresWhenDownWasSwallowedByIme(): Unit {
        val s = newState()
        // KeyDown が届かなかった（IME に吸われた）ケース: KeyUp 単体で発火する。
        assertTrue(handleDeckKey(s, key(KeyEventType.KeyUp, Key.N, 'n')))
        assertTrue(s.showCompose)
    }

    @Test
    fun unmappedKeyIsNotConsumed() {
        val s = newState()
        assertFalse(handleDeckKey(s, key(KeyEventType.KeyDown, Key.Z, 'z')))
        assertFalse(handleDeckKey(s, key(KeyEventType.KeyUp, Key.Z, 'z')))
        assertFalse(s.showCompose)
    }
}
