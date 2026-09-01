package app.nostrdeck.data

import app.nostrdeck.crypto.Nip19
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** [#350] NIP-27 メンション抽出。npub/nprofile → p タグ化の要点を固定する。 */
class Nip27Test {

    private val alice = "a1".repeat(32)
    private val bob = "b2".repeat(32)

    private val aliceNpub = Nip19.hexToNpub(alice)
    private val bobNprofile = Nip19.hexToNprofile(bob, relays = listOf("wss://relay.example.com"))

    // ---- 抽出 ----

    @Test
    fun extracts_npub_mention_with_nostr_prefix() {
        val pks = Nip27.mentionPubkeys("hello nostr:$aliceNpub how are you")
        assertEquals(listOf(alice), pks)
    }

    @Test
    fun extracts_nprofile_mention() {
        // 表示側は nprofile も @名前 に展開する。抽出が npub 限定だと
        // 「見た目はメンションなのに p タグが付かない」不一致になる（報告の一因）。
        val pks = Nip27.mentionPubkeys("cc nostr:$bobNprofile please")
        assertEquals(listOf(bob), pks)
    }

    @Test
    fun extracts_bare_bech_without_prefix() {
        val pks = Nip27.mentionPubkeys("$aliceNpub と $bobNprofile")
        assertEquals(listOf(alice, bob), pks)
    }

    @Test
    fun dedupes_repeated_mentions() {
        val pks = Nip27.mentionPubkeys("nostr:$aliceNpub $aliceNpub")
        assertEquals(listOf(alice), pks)
    }

    @Test
    fun ignores_invalid_checksum() {
        val broken = aliceNpub.dropLast(1) + (if (aliceNpub.last() == 'q') 'p' else 'q')
        assertTrue(Nip27.mentionPubkeys("hi nostr:$broken").isEmpty())
    }

    @Test
    fun ignores_bech_inside_longer_token() {
        // 直前が英数字なら別文字列の一部（語中ヒット回避）。
        assertTrue(Nip27.mentionPubkeys("xx$aliceNpub").isEmpty())
    }

    @Test
    fun ignores_bech_inside_url() {
        // [#369] URL パス中の npub/nprofile は URL の一部。表示側もメンション扱いしないので
        // p タグを付けない（付けると本人に意図しない通知が飛ぶ）。
        assertTrue(Nip27.mentionPubkeys("see https://example.com/user/$aliceNpub").isEmpty())
        // URL の外にあるものは従来どおり拾う。
        assertEquals(listOf(bob), Nip27.mentionPubkeys("https://example.com/user/$aliceNpub nostr:$bobNprofile"))
    }

    // ---- p タグ組み立て ----

    @Test
    fun builds_p_tags_for_mentions() {
        val tags = Nip27.mentionPTags("nostr:$aliceNpub nostr:$bobNprofile")
        assertEquals(listOf(listOf("p", alice), listOf("p", bob)), tags)
    }

    @Test
    fun excludes_pubkeys_already_present() {
        // 返信では NIP-10 継承分（返信相手など）と重複させない。
        val tags = Nip27.mentionPTags("nostr:$aliceNpub nostr:$bobNprofile", existing = listOf(alice))
        assertEquals(listOf(listOf("p", bob)), tags)
    }

    @Test
    fun no_mentions_yields_no_tags() {
        assertTrue(Nip27.mentionPTags("plain text with #hashtag").isEmpty())
    }
}
