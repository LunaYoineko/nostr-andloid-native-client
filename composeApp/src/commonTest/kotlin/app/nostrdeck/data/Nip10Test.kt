package app.nostrdeck.data

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** [#314] NIP-10 の返信タグ組み立て。仕様の要点を1つずつ固定する。 */
class Nip10Test {

    private val root = "r".repeat(64)
    private val mid = "m".repeat(64)
    private val alice = "a".repeat(64)
    private val bob = "b".repeat(64)
    private val me = "c".repeat(64)

    private fun es(tags: List<List<String>>) = tags.filter { it[0] == "e" }
    private fun ps(tags: List<List<String>>) = tags.filter { it[0] == "p" }.map { it[1] }

    // ---- ルートへの直接返信 ----

    @Test
    fun reply_to_root_has_single_root_marker() {
        // 仕様: "A direct reply to the root of a thread should have a single marked
        // 'e' tag of type 'root'." ここが reply になっていたのが報告された症状。
        val tags = Nip10.replyTags(targetId = root, targetPubkey = alice, targetTags = emptyList(), selfPubkey = me)
        val e = es(tags)
        assertEquals(1, e.size, "ルートへの返信は e タグ1本だけ")
        assertEquals("root", e[0][3])
        assertEquals(root, e[0][1])
    }

    @Test
    fun reply_to_root_carries_author_in_fifth_element() {
        val tags = Nip10.replyTags(targetId = root, targetPubkey = alice, targetTags = emptyList(), selfPubkey = me)
        assertEquals(alice, es(tags)[0][4], "e タグ5番目はルート作者")
    }

    // ---- スレッド途中への返信 ----

    @Test
    fun reply_to_mid_thread_keeps_root_and_orders_root_first() {
        // 親の e しか付かず root が落ちていたため、受信側がスレッドを復元できず返信が浮いていた。
        val targetTags = listOf(listOf("e", root, "", "root", alice), listOf("p", alice))
        val tags = Nip10.replyTags(
            targetId = mid, targetPubkey = bob, targetTags = targetTags,
            rootAuthor = alice, selfPubkey = me,
        )
        val e = es(tags)
        assertEquals(2, e.size)
        // 順序も仕様（root → 直接の親）。
        assertEquals(listOf("e", root, "", "root", alice), e[0])
        assertEquals(listOf("e", mid, "", "reply", bob), e[1])
    }

    @Test
    fun reply_omits_fifth_element_when_root_author_unknown() {
        // ルートをローカルに持っていないときは無理に埋めず4要素で出す。
        val targetTags = listOf(listOf("e", root, "", "root"))
        val tags = Nip10.replyTags(targetId = mid, targetPubkey = bob, targetTags = targetTags, selfPubkey = me)
        assertEquals(4, es(tags)[0].size)
        assertEquals("root", es(tags)[0][3])
    }

    // ---- p タグ ----

    @Test
    fun p_tags_inherit_participants_and_append_target_author() {
        val targetTags = listOf(listOf("e", root, "", "root"), listOf("p", alice))
        val tags = Nip10.replyTags(targetId = mid, targetPubkey = bob, targetTags = targetTags, selfPubkey = me)
        // 元の p（スレッド参加者）を引き継ぎ、返信先の作者を末尾に足す。
        assertEquals(listOf(alice, bob), ps(tags))
    }

    @Test
    fun p_tags_exclude_self() {
        // 自分への通知を避ける。仕様は明示していないがそうするクライアントが多い。
        val targetTags = listOf(listOf("p", alice), listOf("p", me))
        val tags = Nip10.replyTags(targetId = root, targetPubkey = bob, targetTags = targetTags, selfPubkey = me)
        assertTrue(me !in ps(tags), "自分は p に入れない")
        assertEquals(listOf(alice, bob), ps(tags))
    }

    @Test
    fun p_tags_drop_target_author_when_replying_to_self() {
        // 自分の投稿への返信。自分を除いた結果 p が空になってよい。
        val tags = Nip10.replyTags(targetId = root, targetPubkey = me, targetTags = emptyList(), selfPubkey = me)
        assertEquals(emptyList(), ps(tags))
    }

    @Test
    fun p_tags_deduplicate() {
        val targetTags = listOf(listOf("p", alice), listOf("p", alice), listOf("p", bob))
        val tags = Nip10.replyTags(targetId = root, targetPubkey = bob, targetTags = targetTags, selfPubkey = me)
        assertEquals(listOf(alice, bob), ps(tags), "重複は落とし、返信先の作者は末尾に1つ")
    }

    @Test
    fun p_tags_are_capped_but_always_keep_target_author() {
        // 長大スレッドで際限なく増えないよう上限を掛ける。返信先の作者だけは必ず残す。
        val many = (0 until 50).map { listOf("p", it.toString().padStart(64, '0')) }
        val tags = Nip10.replyTags(targetId = root, targetPubkey = bob, targetTags = many, selfPubkey = me)
        val p = ps(tags)
        assertEquals(Nip10.MAX_P_TAGS, p.size)
        assertEquals(bob, p.last(), "上限に達しても返信先の作者は落とさない")
    }

    // ---- 読み取り側（既存挙動の固定） ----

    @Test
    fun rootOf_prefers_marker_over_position() {
        val tags = listOf(listOf("e", mid, "", "reply"), listOf("e", root, "", "root"))
        assertEquals(root, Nip10.rootOf(tags))
    }

    @Test
    fun rootOf_ignores_mention() {
        // mention は引用参照。返信扱いすると引用カードと返信文脈で二重表示される。
        val tags = listOf(listOf("e", mid, "", "mention"), listOf("e", root, "", ""))
        assertEquals(root, Nip10.rootOf(tags))
    }

    @Test
    fun replyParentOf_prefers_reply_then_root() {
        assertEquals(mid, Nip10.replyParentOf(listOf(listOf("e", root, "", "root"), listOf("e", mid, "", "reply"))))
        assertEquals(root, Nip10.replyParentOf(listOf(listOf("e", root, "", "root"))))
        assertNull(Nip10.replyParentOf(emptyList()))
    }

    @Test
    fun replyParentOf_falls_back_to_last_positional_e() {
        // マーカー無し（NIP-10 deprecated 形式）は位置ルール: 末尾が直接の親。
        val tags = listOf(listOf("e", root), listOf("e", mid))
        assertEquals(mid, Nip10.replyParentOf(tags))
    }
}
