package app.nostrdeck.model

import kotlin.test.Test
import kotlin.test.assertEquals

/** [#384] addressable(3xxxx) の版畳み。同一 d タグはリレーに古い版も残るので最新だけ出す。 */
class AddressableTest {

    private fun article(id: String, d: String, at: Long, title: String = "") = NostrEvent(
        id = id, pubkey = "author", kind = 30023, createdAt = at, content = "",
        tags = buildList {
            add(listOf("d", d))
            if (title.isNotBlank()) add(listOf("title", title))
        },
    )

    @Test
    fun keeps_only_latest_version_per_d_tag() {
        val rows = listOf(
            article("v2", "hello", 200),
            article("other", "second", 150),
            article("v1", "hello", 100),
        )
        val out = latestByDTag(rows)
        assertEquals(listOf("v2", "other"), out.map { it.id })
    }

    @Test
    fun sorted_newest_first() {
        val out = latestByDTag(listOf(article("a", "a", 10), article("b", "b", 30), article("c", "c", 20)))
        assertEquals(listOf("b", "c", "a"), out.map { it.id })
    }

    @Test
    fun events_without_d_tag_share_the_empty_coordinate() {
        // d 無しは NIP-01 上 d="" と同じ座標。古い版が並んで出ないこと。
        val noD1 = NostrEvent("x", "author", 30023, 100, "")
        val noD2 = NostrEvent("y", "author", 30023, 300, "")
        assertEquals(listOf("y"), latestByDTag(listOf(noD1, noD2)).map { it.id })
    }

    @Test
    fun tag_helpers_read_first_non_blank_value() {
        val e = article("a", "slug", 1, title = "タイトル")
        assertEquals("slug", e.dTag())
        assertEquals("タイトル", e.tagValue("title"))
        assertEquals(null, e.tagValue("summary"))
    }
}
