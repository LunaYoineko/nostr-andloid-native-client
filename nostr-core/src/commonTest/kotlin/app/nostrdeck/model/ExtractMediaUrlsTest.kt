package app.nostrdeck.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** [#326] 本文からメディアURLを剥がす。#326 で見つけた3つの穴を固定する。 */
class ExtractMediaUrlsTest {

    @Test
    fun image_url_is_stripped_and_returned() {
        val (text, images) = extractMediaUrls("ねこ https://example.com/a.jpg")
        assertEquals("ねこ", text)
        assertEquals(listOf("https://example.com/a.jpg"), images)
    }

    @Test
    fun video_url_is_stripped_but_not_an_image() {
        // #326 の主症状。動画はインラインプレイヤーで出るのに、本文にも URL が残っていた。
        val (text, images) = extractMediaUrls("どうが https://example.com/v.mp4")
        assertEquals("どうが", text)
        assertTrue(images.isEmpty(), "動画は画像グリッドに渡さない")
    }

    @Test
    fun all_video_extensions_are_stripped() {
        listOf("mp4", "webm", "mov", "m4v").forEach { ext ->
            val (text, _) = extractMediaUrls("x https://example.com/v.$ext")
            assertEquals("x", text, "$ext が剥がれていない")
        }
    }

    @Test
    fun bmp_and_avif_are_stripped_and_shown_as_images() {
        // 以前は本文剥がしの正規表現に入っておらず、かつ埋め込み側では「画像だから」と
        // 除外されるため、URL が裸で残るだけで画像も出なかった。
        listOf("bmp", "avif").forEach { ext ->
            val (text, images) = extractMediaUrls("x https://example.com/a.$ext")
            assertEquals("x", text, "$ext が剥がれていない")
            assertEquals(listOf("https://example.com/a.$ext"), images, "$ext が画像として出ていない")
        }
    }

    @Test
    fun uppercase_extension_is_handled() {
        val (text, images) = extractMediaUrls("x https://example.com/A.JPG")
        assertEquals("x", text)
        assertEquals(1, images.size)
    }

    @Test
    fun query_string_does_not_break_detection() {
        val (text, images) = extractMediaUrls("x https://example.com/a.jpg?w=100")
        assertEquals("x", text)
        assertEquals(listOf("https://example.com/a.jpg?w=100"), images)
    }

    @Test
    fun non_media_url_is_left_in_place() {
        // OGP カードの対象。ここでは触らず、描画側が設定に従って畳む。
        val body = "記事 https://example.com/post"
        val (text, images) = extractMediaUrls(body)
        assertEquals(body, text, "剥がすものが無ければ原文をそのまま返す")
        assertTrue(images.isEmpty())
    }

    @Test
    fun null_means_nothing_left_to_show_not_nothing_stripped() {
        // 動画のみ/画像のみの投稿だけが null。呼び出し側が「images が空だから原文」と
        // 判断してしまうと、動画のみの発言で URL が出る（チャットで実際に起きていた）。
        val (videoOnly, videoImages) = extractMediaUrls("https://e.com/v.mp4")
        assertNull(videoOnly)
        assertTrue(videoImages.isEmpty(), "動画は images に入らない")

        val (imageOnly, _) = extractMediaUrls("https://e.com/a.jpg")
        assertNull(imageOnly)
    }

    @Test
    fun mixed_content_keeps_reading_order_of_images() {
        val (text, images) = extractMediaUrls(
            "まえ https://e.com/1.png なか https://e.com/v.mp4 うしろ https://e.com/2.png",
        )
        assertEquals("まえ なか うしろ", text)
        assertEquals(listOf("https://e.com/1.png", "https://e.com/2.png"), images)
    }

    @Test
    fun duplicate_image_url_is_listed_once() {
        val (_, images) = extractMediaUrls("https://e.com/a.jpg https://e.com/a.jpg")
        assertEquals(1, images.size)
    }

    // ---- カード化済みURLの畳み込み ----

    @Test
    fun carded_urls_respect_the_pref() {
        val body = "記事 https://example.com/post"
        assertEquals(
            listOf("https://example.com/post"),
            cardedUrlsToHide(body, EmbedPrefs(hideCardedUrls = true)),
        )
        assertTrue(
            cardedUrlsToHide(body, EmbedPrefs(hideCardedUrls = false)).isEmpty(),
            "設定 OFF なら畳まない",
        )
    }

    @Test
    fun carded_urls_follow_the_per_kind_toggles() {
        // カードを出していないのに URL だけ消える、が起きないこと。
        val body = "記事 https://example.com/post"
        assertTrue(
            cardedUrlsToHide(body, EmbedPrefs(ogp = false)).isEmpty(),
            "OGP カードを出さない設定なら URL も残す",
        )
    }

    @Test
    fun removeUrls_cleans_up_leftover_whitespace() {
        val body = "まえ https://e.com/x  うしろ"
        assertEquals("まえ うしろ", removeUrls(body, listOf("https://e.com/x")))
    }

    @Test
    fun removeUrls_returns_null_when_nothing_is_left() {
        assertNull(removeUrls("https://e.com/x", listOf("https://e.com/x")))
    }
}
