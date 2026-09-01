package app.nostrdeck.data

import app.nostrdeck.model.ColumnKind
import app.nostrdeck.model.ColumnRenderer
import app.nostrdeck.model.ColumnSpec
import app.nostrdeck.model.ReqFilter
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** [#374] リレー同期の差分計算（設定・カラム構成）と個別適用のテスト。 */
class SettingsSyncDiffTest {

    // ---- 設定の差分 ----

    @Test
    fun settings_same_values_yield_no_diff() {
        val local = mapOf(
            EventRepository.AUTH_POLICY to "dm",
            EventRepository.BOLD_TEXT_KEY to "0",
        )
        assertEquals(emptyList(), diffSyncSettings(local, local))
    }

    @Test
    fun settings_changed_values_are_listed_in_whitelist_order() {
        val local = mapOf(
            EventRepository.AUTH_POLICY to "dm",
            EventRepository.BOLD_TEXT_KEY to "0",
            EventRepository.NOTE_ACCENT_STYLE_KEY to "none",
        )
        val remote = mapOf(
            EventRepository.NOTE_ACCENT_STYLE_KEY to "line",
            EventRepository.AUTH_POLICY to "always",
            EventRepository.BOLD_TEXT_KEY to "0",
        )
        val diffs = diffSyncSettings(local, remote)
        assertEquals(
            listOf(
                SettingDiff(EventRepository.AUTH_POLICY, "dm", "always"),
                SettingDiff(EventRepository.NOTE_ACCENT_STYLE_KEY, "none", "line"),
            ),
            diffs,
        )
    }

    @Test
    fun settings_keys_missing_on_remote_or_unknown_are_ignored() {
        val local = mapOf(
            EventRepository.AUTH_POLICY to "dm",
            EventRepository.BOLD_TEXT_KEY to "1",
        )
        // リモートは古いスナップショット（AUTH_POLICY 無し）+ ホワイトリスト外のキー。
        val remote = mapOf(
            EventRepository.BOLD_TEXT_KEY to "0",
            "unknown:key" to "x",
        )
        assertEquals(
            listOf(SettingDiff(EventRepository.BOLD_TEXT_KEY, "1", "0")),
            diffSyncSettings(local, remote),
        )
    }

    // ---- カラム構成の差分 ----

    private fun col(id: String, title: String = id, order: Int = 0, hashtags: List<String> = emptyList()) =
        ColumnSpec(
            id = id, title = title, subtitle = "",
            kind = if (hashtags.isEmpty()) ColumnKind.FOLLOWING else ColumnKind.HASHTAG,
            renderer = ColumnRenderer.FEED,
            filter = ReqFilter(hashtags = hashtags),
            pinned = true, order = order,
        )

    @Test
    fun columns_identical_yield_no_diff() {
        val cols = listOf(col("a", order = 0), col("b", order = 1))
        assertEquals(emptyList(), diffDeckColumns(cols, cols))
    }

    @Test
    fun columns_added_removed_changed_are_detected_per_column() {
        val local = listOf(col("a", order = 0), col("b", title = "旧タイトル", order = 1))
        val remote = listOf(
            col("b", title = "新タイトル", order = 0),
            col("c", title = "追加カラム", order = 1),
        )
        val diffs = diffDeckColumns(local, remote)
        assertTrue(diffs.any { it is ColumnDiff.Added && it.spec.id == "c" })
        assertTrue(diffs.any { it is ColumnDiff.Removed && it.spec.id == "a" })
        assertTrue(diffs.any { it is ColumnDiff.Changed && it.remote.title == "新タイトル" })
        // 共通カラムは b の1つだけなので並び順の差分は出ない。
        assertTrue(diffs.none { it is ColumnDiff.Reordered })
    }

    @Test
    fun columns_filter_change_is_detected() {
        val local = listOf(col("a", hashtags = listOf("nostr")))
        val remote = listOf(col("a", hashtags = listOf("zap")))
        val diffs = diffDeckColumns(local, remote)
        assertEquals(1, diffs.size)
        assertTrue(diffs[0] is ColumnDiff.Changed)
    }

    @Test
    fun columns_reorder_only_yields_single_reordered_diff() {
        val local = listOf(col("a", order = 0), col("b", order = 1))
        val remote = listOf(col("b", order = 0), col("a", order = 1))
        val diffs = diffDeckColumns(local, remote)
        assertEquals(listOf<ColumnDiff>(ColumnDiff.Reordered(listOf("b", "a"))), diffs)
    }

    // ---- 個別適用 ----

    @Test
    fun apply_selected_diffs_only() {
        val local = listOf(col("a", order = 0), col("b", title = "旧", order = 1))
        val remote = listOf(col("b", title = "新", order = 0), col("c", order = 1))
        val diffs = diffDeckColumns(local, remote)
        // 追加(c)だけ選択。削除(a)・変更(b)は未選択のまま。
        val selected = diffs.filterIsInstance<ColumnDiff.Added>()
        val applied = applyColumnDiffs(local, selected)
        assertEquals(listOf("a", "b", "c"), applied.map { it.id }.sorted())
        assertEquals("旧", applied.first { it.id == "b" }.title)
    }

    @Test
    fun apply_all_diffs_reproduces_remote() {
        val local = listOf(col("a", order = 0), col("b", title = "旧", order = 1), col("d", order = 2))
        val remote = listOf(
            col("c", title = "追加", order = 0),
            col("b", title = "新", order = 1),
            col("a", order = 2),
        )
        val diffs = diffDeckColumns(local, remote)
        val applied = applyColumnDiffs(local, diffs)
        assertEquals(listOf("c", "b", "a"), applied.map { it.id })
        assertEquals("新", applied.first { it.id == "b" }.title)
        assertEquals(listOf(0, 1, 2), applied.map { it.order })
    }

    @Test
    fun apply_reorder_keeps_local_only_columns_at_tail() {
        val local = listOf(col("x", order = 0), col("a", order = 1), col("b", order = 2))
        val remote = listOf(col("b", order = 0), col("a", order = 1))
        val diffs = diffDeckColumns(local, remote)
        // 並び順だけ選択（x の削除は選択しない）。
        val selected = diffs.filterIsInstance<ColumnDiff.Reordered>()
        val applied = applyColumnDiffs(local, selected)
        assertEquals(listOf("b", "a", "x"), applied.map { it.id })
    }

    @Test
    fun apply_removed_diff_deletes_column() {
        val local = listOf(col("a", order = 0), col("b", order = 1))
        val remote = listOf(col("a", order = 0))
        val diffs = diffDeckColumns(local, remote)
        val applied = applyColumnDiffs(local, diffs.filterIsInstance<ColumnDiff.Removed>())
        assertEquals(listOf("a"), applied.map { it.id })
    }
}
