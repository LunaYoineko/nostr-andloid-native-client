package app.nostrdeck.data

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** [#380] NIP-22（kind:1111）のタグ解釈と返信タグ組み立て。仕様の要点を1つずつ固定する。 */
class Nip22Test {

    private val rootId = "r".repeat(64)
    private val parentId = "m".repeat(64)
    private val rootAuthor = "a".repeat(64)
    private val parentAuthor = "b".repeat(64)
    private val articleAddr = "30023:${rootAuthor}:my-article"

    // ---- 読み取り（大文字=ルート / 小文字=親） ----

    @Test
    fun uppercase_tags_are_root_and_lowercase_are_parent() {
        val tags = listOf(
            listOf("E", rootId, "wss://r", rootAuthor),
            listOf("K", "1063"),
            listOf("P", rootAuthor),
            listOf("e", parentId, "wss://r", parentAuthor),
            listOf("k", "1111"),
            listOf("p", parentAuthor),
        )
        assertEquals(rootId, Nip22.rootEventIdOf(tags))
        assertEquals(parentId, Nip22.parentEventIdOf(tags))
        assertEquals(1063, Nip22.rootKindOf(tags))
        assertEquals(rootAuthor, Nip22.rootAuthorOf(tags))
    }

    @Test
    fun external_root_kind_is_not_numeric() {
        // 外部URLコメント: K タグは "web"（NIP-73）。数値化できないので null。
        val tags = listOf(
            listOf("I", "https://abc.com/articles/1"),
            listOf("K", "web"),
            listOf("i", "https://abc.com/articles/1"),
            listOf("k", "web"),
        )
        assertEquals("https://abc.com/articles/1", Nip22.rootExternalOf(tags))
        assertNull(Nip22.rootKindOf(tags))
        assertNull(Nip22.rootEventIdOf(tags))
    }

    // ---- スレッド構築の親決定 ----

    @Test
    fun thread_parent_prefers_lowercase_e() {
        val tags = listOf(
            listOf("E", rootId, "", rootAuthor),
            listOf("e", parentId, "", parentAuthor),
        )
        assertEquals(parentId, Nip22.threadParentOf(tags))
    }

    @Test
    fun thread_parent_falls_back_to_root_e_when_no_lowercase() {
        val tags = listOf(listOf("E", rootId, "", rootAuthor), listOf("K", "1063"))
        assertEquals(rootId, Nip22.threadParentOf(tags))
    }

    @Test
    fun thread_parent_resolves_address_via_map() {
        // 記事へのトップレベルコメント（a のみ・e 無し）。アドレス→id マップで記事に接続する。
        val articleId = "d".repeat(64)
        val tags = listOf(
            listOf("A", articleAddr, "wss://r"),
            listOf("K", "30023"),
            listOf("a", articleAddr, "wss://r"),
            listOf("k", "30023"),
        )
        assertEquals(articleId, Nip22.threadParentOf(tags, mapOf(articleAddr to articleId)))
        // 記事が未取得（マップに無い）なら null = 取得済み集合の中では起点扱い。
        assertNull(Nip22.threadParentOf(tags))
    }

    // ---- 返信タグ組み立て（1111 への返信 → 1111） ----

    @Test
    fun reply_inherits_root_scope_and_points_parent_with_lowercase() {
        val parentTags = listOf(
            listOf("A", articleAddr, "wss://r"),
            listOf("K", "30023"),
            listOf("P", rootAuthor, "wss://r"),
            listOf("a", articleAddr),
            listOf("e", rootId),
            listOf("k", "30023"),
            listOf("p", rootAuthor),
        )
        val tags = Nip22.replyTags(parentId, parentAuthor, parentTags)
        // ルートの大文字タグはリレーヒントごと引き継ぐ。
        assertTrue(listOf("A", articleAddr, "wss://r") in tags)
        assertTrue(listOf("K", "30023") in tags)
        assertTrue(listOf("P", rootAuthor, "wss://r") in tags)
        // 親は小文字 e/k/p（e の4要素目は親の作者。k は親の kind=1111）。
        assertTrue(listOf("e", parentId, "", parentAuthor) in tags)
        assertTrue(listOf("k", "1111") in tags)
        assertTrue(listOf("p", parentAuthor) in tags)
        // 親の小文字タグ（旧親への参照）は引き継がない。
        assertTrue(tags.none { it[0] == "a" })
        assertTrue(tags.none { it[0] == "e" && it[1] == rootId })
    }

    @Test
    fun reply_to_malformed_comment_promotes_parent_to_root() {
        // ルート情報を欠く非標準の 1111 に返信しても、ツリーが切れないよう親をルートに立てる。
        val tags = Nip22.replyTags(parentId, parentAuthor, emptyList())
        assertTrue(listOf("E", parentId, "", parentAuthor) in tags)
        assertTrue(listOf("K", "1111") in tags)
        assertTrue(listOf("P", parentAuthor) in tags)
        assertTrue(listOf("e", parentId, "", parentAuthor) in tags)
    }
}
