package app.nostrdeck.ui

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * [#383] プロフィールのタブ状態は rememberSaveable で名前保存する。
 * タブ構成を変えたときに保存済みの旧値が復元されても落ちないこと（＝既定へ倒れること）を守る。
 */
class ProfileTabTest {

    @Test
    fun unknown_saved_tab_falls_back_to_posts() {
        // 統合で消えた旧タブ名 / 旧実装の序数保存 / 空 / null のいずれも既定へ。
        assertEquals("POSTS", profileTabNameOrDefault("REPLIES"))
        assertEquals("POSTS", profileTabNameOrDefault("1"))
        assertEquals("POSTS", profileTabNameOrDefault(""))
        assertEquals("POSTS", profileTabNameOrDefault(null))
    }

    @Test
    fun known_tab_is_kept() {
        assertEquals("POSTS", profileTabNameOrDefault("POSTS"))
        assertEquals("MEDIA", profileTabNameOrDefault("MEDIA"))
    }
}
