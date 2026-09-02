package app.nostrdeck.model

import kotlin.test.Test
import kotlin.test.assertEquals

/** [#386] kind:10002 の `r` タグ（read/write マーカー）の解釈。 */
class Nip65Test {

    @Test
    fun marker_decides_read_and_write() {
        val prefs = nip65PrefsFromTags(
            listOf(
                listOf("r", "wss://both.example"),
                listOf("r", "wss://in.example", "read"),
                listOf("r", "wss://out.example", "write"),
            ),
        )
        assertEquals(3, prefs.size)
        assertEquals(true to true, prefs[0].read to prefs[0].write)
        assertEquals(true to false, prefs[1].read to prefs[1].write)
        assertEquals(false to true, prefs[2].read to prefs[2].write)
        assertEquals(listOf("nip65", "nip65", "nip65"), prefs.map { it.source })
    }

    @Test
    fun urls_are_normalized_and_deduped() {
        val prefs = nip65PrefsFromTags(
            listOf(
                listOf("r", " wss://a.example/ "),
                listOf("r", "wss://a.example", "read"),   // 正規化後に重複 → 先勝ち
                listOf("r", "wss://b.example"),
            ),
        )
        assertEquals(listOf("wss://a.example", "wss://b.example"), prefs.map { it.url })
        assertEquals(true, prefs.first().write)   // 先に来たマーカー無し(両用)が残る
    }

    @Test
    fun own_relay_list_keeps_ws_but_drops_blank() {
        // [#390] 自分側(requireWss=false): ローカル開発リレーの ws:// はそのまま通し、空 URL だけ捨てる。
        val prefs = nip65PrefsFromTags(
            listOf(
                listOf("r", "ws://localhost:7777", "write"),
                listOf("r", "wss://a.example"),
                listOf("r", "   "),
                listOf("r", "wss://a.example/"),   // 正規化後に重複
            ),
            requireWss = false,
        )
        assertEquals(listOf("ws://localhost:7777", "wss://a.example"), prefs.map { it.url })
        assertEquals(false to true, prefs[0].read to prefs[0].write)
    }

    @Test
    fun own_relay_list_normalizes_marker_case_and_spaces() {
        // [#390] 旧 updateRelayList は生比較だったため "Write" を両用と誤解釈して接続していた。
        val prefs = nip65PrefsFromTags(
            listOf(
                listOf("r", "wss://w.example", "Write"),
                listOf("r", "wss://r.example", " read "),
                listOf("r", "wss://both.example", ""),   // 空マーカー = 無印
            ),
            requireWss = false,
        )
        assertEquals(false to true, prefs[0].read to prefs[0].write)
        assertEquals(true to false, prefs[1].read to prefs[1].write)
        assertEquals(true to true, prefs[2].read to prefs[2].write)
    }

    @Test
    fun non_wss_and_malformed_tags_are_dropped() {
        val prefs = nip65PrefsFromTags(
            listOf(
                listOf("r", "ws://plain.example"),
                listOf("r", "https://not-a-relay.example"),
                listOf("r"),                       // 値なし
                listOf("p", "wss://wrong-tag.example"),
                listOf("r", "wss://ok.example", "READ"),  // マーカーは大小文字を問わない
            ),
        )
        assertEquals(listOf("wss://ok.example"), prefs.map { it.url })
        assertEquals(false, prefs.first().write)
    }
}
