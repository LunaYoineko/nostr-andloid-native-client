package app.nostrdeck.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** [#385] NIP-51 セット（フォローセット30000 / ブックマークセット30003）のタグ解釈。 */
class Nip51SetTest {

    private fun ev(
        id: String, kind: Int, tags: List<List<String>>, at: Long = 100, content: String = "",
    ) = NostrEvent(id, "author", kind, at, content, tags)

    @Test
    fun follow_set_reads_title_and_members() {
        val e = ev(
            "a", 30000,
            listOf(
                listOf("d", "friends"),
                listOf("title", "仲良し"),
                listOf("description", "よく読む人"),
                listOf("p", "pk1"),
                listOf("p", "pk2"),
                listOf("p", "pk1"),          // 重複は畳む
                listOf("p", ""),             // 空値は無視
                listOf("p"),                 // 値なしタグも無視
            ),
        )
        val set = parseNip51Set(e)
        assertEquals("仲良し", set.title)
        assertEquals("よく読む人", set.description)
        assertEquals(listOf("pk1", "pk2"), set.members)
        assertEquals(2, set.count)
        assertEquals("30000:author:friends", set.address)
    }

    @Test
    fun title_falls_back_to_d_tag() {
        val set = parseNip51Set(ev("a", 30000, listOf(listOf("d", "my-list"), listOf("p", "pk1"))))
        assertEquals("my-list", set.title)
    }

    @Test
    fun bookmark_set_reads_events_and_addresses() {
        val set = parseNip51Set(
            ev(
                "b", 30003,
                listOf(
                    listOf("d", "reads"),
                    listOf("e", "ev1"),
                    listOf("a", "30023:pk:slug"),
                ),
            ),
        )
        assertEquals(listOf("ev1"), set.eventIds)
        assertEquals(listOf("30023:pk:slug"), set.addresses)
        assertEquals(2, set.count)
    }

    @Test
    fun encrypted_content_is_flagged_but_not_decoded() {
        val set = parseNip51Set(ev("c", 30000, listOf(listOf("d", "x"), listOf("p", "pk1")), content = "cipher?iv=…"))
        assertTrue(set.hasPrivate)
        assertEquals(listOf("pk1"), set.members)   // 公開タグのみ
    }

    @Test
    fun sets_keep_latest_version_and_drop_empty_ones() {
        val out = parseNip51Sets(
            listOf(
                ev("old", 30000, listOf(listOf("d", "x"), listOf("p", "pk1")), at = 100),
                ev("new", 30000, listOf(listOf("d", "x"), listOf("p", "pk1"), listOf("p", "pk2")), at = 200),
                ev("empty", 30003, listOf(listOf("d", "y")), at = 300),          // 公開項目も非公開も無い
                ev("bm", 30003, listOf(listOf("d", "z"), listOf("e", "ev1")), at = 150),
                ev("other", 30001, listOf(listOf("d", "w"), listOf("e", "ev2")), at = 400), // 対象外 kind
            ),
        )
        assertEquals(listOf("x", "z"), out.map { it.dTag })          // 新しい順・空セットと対象外は落ちる
        assertEquals(listOf("pk1", "pk2"), out.first().members)      // 最新版のメンバー
    }

    @Test
    fun private_only_set_is_kept() {
        // 中身が全部非公開でも「非公開がある」ことは見せる価値があるので残す。
        val out = parseNip51Sets(listOf(ev("p", 30000, listOf(listOf("d", "secret")), content = "cipher")))
        assertEquals(1, out.size)
        assertTrue(out.first().hasPrivate)
    }
}
