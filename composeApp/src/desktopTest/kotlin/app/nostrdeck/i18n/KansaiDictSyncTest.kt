package app.nostrdeck.i18n

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * [#710] 同梱した関西弁の辞書が Web（正）と同じで、ネイティブの文言と食い違っていないこと。
 * Web 側を変えたら scripts/sync-kansai-dict.sh で写す（写し忘れるとここで落ちる）。
 * テストの作業ディレクトリは composeApp。
 */
class KansaiDictSyncTest {

    private val bundled = File("src/commonMain/composeResources/files/ja-kansai.json")
    private val web = File("../web/src/i18n/ja-kansai.json")
    private val dict by lazy { Dialect.parse(bundled.readText()) }

    private fun nativeJa(): Map<String, String> {
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder()
            .parse(File("src/commonMain/composeResources/values-ja/strings.xml"))
        val nodes = doc.getElementsByTagName("string")
        return (0 until nodes.length).associate { i ->
            val e = nodes.item(i)
            e.attributes.getNamedItem("name").nodeValue to e.textContent
        }
    }

    private fun placeholders(s: String) = Regex("""%\d+\$[ds]""").findAll(s).map { it.value }.sorted().toList()

    @Test
    fun bundled_dictionary_matches_web() {
        assertTrue(web.exists(), "Web の辞書が見つからない: ${web.absolutePath}")
        assertEquals(web.readText(), bundled.readText(), "scripts/sync-kansai-dict.sh で Web から写すこと")
    }

    @Test
    fun app_can_read_the_bundled_dictionary_as_a_resource() = kotlinx.coroutines.runBlocking {
        // App は Res.readBytes(Dialect.DICT_PATH) で読む。パスがずれると、黙って日本語のままになる。
        val map = Dialect.parse(nostr_deck_client.composeapp.generated.resources.Res.readBytes(Dialect.DICT_PATH).decodeToString())
        assertEquals(dict, map)
    }

    @Test
    fun native_keys_keep_the_same_placeholders() {
        // 差し込み位置がずれると、関西弁に切り替えたときだけ文言が壊れる。
        val ja = nativeJa()
        val shared = dict.keys.filter { it in ja }
        assertTrue(shared.isNotEmpty())
        shared.forEach { key -> assertEquals(placeholders(ja.getValue(key)), placeholders(dict.getValue(key)), key) }
    }

    @Test
    fun mode_headings_stay_standard() {
        // 「にゃにゃにゃウイルス」「廃人モード」「うにゅうと握手」は ja と同じ文字列のまま（Web と同じ規則）。
        listOf("nyan_mode_title", "dense_mode_title", "kansai_title", "kansai_toggle").forEach {
            assertFalse(it in dict, it)
        }
    }
}
