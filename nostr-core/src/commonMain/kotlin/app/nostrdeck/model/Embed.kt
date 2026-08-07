package app.nostrdeck.model

/**
 * 本文内リンクの埋め込み表示に関する設定（設定 > 表示）。app_setting(KV) に永続。
 *  - [youtube]/[spotify] : それぞれの埋め込みカードを出すか
 *  - [ogp]               : 一般リンクの OGP カードを出すか
 *  - [ogpImages]         : OGP カードで画像を読み込むか（通信量を抑えたい場合は false）
 */
data class EmbedPrefs(
    val youtube: Boolean = true,
    val spotify: Boolean = true,
    val ogp: Boolean = true,
    val ogpImages: Boolean = true,
    val video: Boolean = true,       // 動画(.mp4/.webm/.mov 等)の直リンクをインライン再生するか
    // [#326] カードやプレイヤーを出したリンクの URL 文字列を本文から畳むか。
    // 画像・動画は常に畳む（プレイヤーの真上に同じURLが並ぶ意味が無い）。ここが効くのは
    // OGP/YouTube/Spotify で、カードにタイトルとドメインが出るぶん URL は冗長になる。
    // 既定 true。URL そのものを読みたい向きのために切れるようにしてある。
    val hideCardedUrls: Boolean = true,
)

/** OGP(OpenGraph) メタ情報。取得できた範囲のみ埋める。 */
data class OgpData(
    val url: String,
    val title: String? = null,
    val description: String? = null,
    val image: String? = null,
    val siteName: String? = null,
)

/** 本文リンクの種別（表示カードの出し分けに使う）。 */
enum class EmbedKind { YOUTUBE, SPOTIFY, OGP, VIDEO }

/** 検出した1リンク。 */
data class LinkEmbed(val url: String, val kind: EmbedKind, val youtubeId: String? = null)

// [#326] メディア判定の**唯一の出どころ**。以前は本文剥がし側（ContentText の imageUrlRegex）に
// jpg/jpeg/png/gif/webp の5種だけを別で持っており、bmp/avif が「本文からも剥がれず、
// 画像扱いで埋め込みからも除外される」＝URLが裸で残るだけ、という穴が空いていた。
val IMAGE_EXT = setOf("jpg", "jpeg", "png", "gif", "webp", "bmp", "avif")
val VIDEO_EXT = setOf("mp4", "webm", "mov", "m4v")

/** URL の末尾に付きがちな句読点/閉じ括弧を落とす（本文中のURLは文章に埋まっているため）。 */
fun trimUrlTail(url: String): String =
    url.trimEnd('.', ',', '、', '。', ')', '】', '」', '！', '？', '!', '?', ';', ':')

/** URL の拡張子（クエリ/フラグメントを除いた小文字）。無ければ空文字。 */
fun urlExtension(url: String): String =
    url.substringAfterLast('/').substringBefore('?').substringBefore('#')
        .lowercase().substringAfterLast('.', "")

/**
 * 本文からリンク埋め込み候補を抽出する（純ロジック・テスト可能）。
 *  - 画像 URL（拡張子で判定）は [NoteImages] が別途表示するため除外。
 *  - 末尾の句読点/閉じ括弧を落として正規化し、URL 単位で重複排除。上限 [max] 件。
 *
 * [#181] URL の発見は共通トークナイザ [tokenizeNostrContent] に一本化した
 * （本文装飾 [app.nostrdeck.ui.noteAnnotated] と同じ終端規則。従来の追加 trimEnd は残す）。
 */
fun detectEmbeds(content: String, max: Int = 4): List<LinkEmbed> {
    val out = LinkedHashMap<String, LinkEmbed>()
    for (tok in tokenizeNostrContent(content)) {
        if (tok !is ContentToken.Url) continue
        val url = trimUrlTail(tok.url)
        if (out.containsKey(url)) continue
        val ext = urlExtension(url)
        if (ext in IMAGE_EXT) continue                 // 画像は別枠で表示
        val yid = youtubeId(url)
        val kind = when {
            ext in VIDEO_EXT -> EmbedKind.VIDEO         // 動画の直リンクはインラインプレイヤーで再生
            yid != null -> EmbedKind.YOUTUBE
            isSpotify(url) -> EmbedKind.SPOTIFY
            else -> EmbedKind.OGP
        }
        out[url] = LinkEmbed(url, kind, yid)
        if (out.size >= max) break
    }
    return out.values.toList()
}

/**
 * [NIP-92][#140] imeta タグ1件分のメタデータ。
 * @param thumb サムネイル URL（thumb が無ければ image で代用）
 * @param dim 原寸の (幅, 高さ)。読み込み前からアスペクト比を確保し、レイアウトのガタつきを防ぐ
 * @param blurhash 読み込み中のぼかしプレースホルダ（[Blurhash.decode] で展開）
 */
data class ImetaInfo(
    val thumb: String? = null,
    val dim: Pair<Int, Int>? = null,
    val blurhash: String? = null,
)

/**
 * [NIP-92] imeta タグから「メディア URL → メタデータ」の対応を取り出す。
 * imeta は ["imeta", "url https://…", "thumb https://…", "blurhash …", "dim 1920x1080", …] の形式で、
 * 2要素目以降が「キー 値」の空白区切り。
 */
fun imetaInfo(tags: List<List<String>>): Map<String, ImetaInfo> {
    val out = HashMap<String, ImetaInfo>()
    for (tag in tags) {
        if (tag.firstOrNull() != "imeta") continue
        var url: String? = null
        var thumb: String? = null
        var image: String? = null
        var dim: Pair<Int, Int>? = null
        var blurhash: String? = null
        for (field in tag.drop(1)) {
            val sp = field.indexOf(' ')
            if (sp <= 0) continue
            val value = field.substring(sp + 1).trim()
            if (value.isEmpty()) continue
            when (field.substring(0, sp)) {
                "url" -> url = value
                "thumb" -> thumb = value
                "image" -> image = value
                "dim" -> dim = parseDim(value)
                "blurhash" -> blurhash = value
            }
        }
        val u = url ?: continue
        out[u] = ImetaInfo(thumb = thumb ?: image, dim = dim, blurhash = blurhash)
    }
    return out
}

/** "1920x1080" → (1920, 1080)。不正・0以下は null。 */
private fun parseDim(s: String): Pair<Int, Int>? {
    val x = s.indexOf('x')
    if (x <= 0) return null
    val w = s.substring(0, x).toIntOrNull() ?: return null
    val h = s.substring(x + 1).toIntOrNull() ?: return null
    return if (w > 0 && h > 0) w to h else null
}

/**
 * [NIP-92] imeta タグから「メディア URL → サムネイル URL」の対応を取り出す（[imetaInfo] の薄いラッパ）。
 * アップローダー(nostr.build 等)が生成したサムネをそのまま使えるので、
 * 動画から1フレーム取得するより速く通信も少ない。
 */
fun imetaThumbs(tags: List<List<String>>): Map<String, String> =
    imetaInfo(tags).mapNotNull { (u, m) -> m.thumb?.let { u to it } }.toMap()

private fun isSpotify(url: String): Boolean =
    Regex("""^https?://open\.spotify\.com/""", RegexOption.IGNORE_CASE).containsMatchIn(url)

/** YouTube の動画 ID を取り出す（watch?v= / youtu.be / shorts / embed）。非 YouTube は null。 */
fun youtubeId(url: String): String? {
    val patterns = listOf(
        Regex("""youtu\.be/([A-Za-z0-9_-]{11})""", RegexOption.IGNORE_CASE),
        Regex("""youtube\.com/watch\?[^ ]*v=([A-Za-z0-9_-]{11})""", RegexOption.IGNORE_CASE),
        Regex("""youtube\.com/shorts/([A-Za-z0-9_-]{11})""", RegexOption.IGNORE_CASE),
        Regex("""youtube\.com/embed/([A-Za-z0-9_-]{11})""", RegexOption.IGNORE_CASE),
    )
    for (p in patterns) p.find(url)?.let { return it.groupValues[1] }
    return null
}

/**
 * [#326] 本文から**表示に不要なメディアURL**を取り除き、`(表示本文, 画像URL一覧)` を返す。
 *
 * 取り除くのは画像と動画。どちらも本文の外（画像グリッド / インラインプレイヤー）に出るので、
 * URL 文字列が本文にも残ると同じものが二重に並ぶ。**動画が剥がれていなかったのが #326 の主症状。**
 *
 * 判定は [IMAGE_EXT] / [VIDEO_EXT] を直接見る。以前は本文剥がし側だけが別の正規表現
 * （5拡張子）を持っていて、bmp/avif がどちらの経路にも乗らず裸で残っていた。
 *
 * OGP/YouTube/Spotify はここでは触らない。カードを出すかどうかが設定と描画側の都合で決まるため、
 * [cardedUrlsToHide] で描画時に畳む。
 */
fun extractMediaUrls(content: String): Pair<String?, List<String>> {
    val images = LinkedHashSet<String>()
    val strip = LinkedHashSet<String>()
    for (tok in tokenizeNostrContent(content)) {
        if (tok !is ContentToken.Url) continue
        val url = trimUrlTail(tok.url)
        when (urlExtension(url)) {
            in IMAGE_EXT -> { images.add(url); strip.add(url) }
            in VIDEO_EXT -> strip.add(url)
        }
    }
    // 剥がすものが無ければ原文をそのまま返す。**null は「表示する本文が残らなかった」だけ**を
    // 意味する（画像のみ/動画のみの投稿）。以前は「何も剥がさなかった」も null で表しており、
    // 呼び出し側が images の空かどうかで区別しようとして、動画のみの投稿で URL を出していた。
    if (strip.isEmpty()) return content.ifBlank { null } to emptyList()
    return removeUrls(content, strip) to images.toList()
}

/**
 * [#326] 本文から [urls] を取り除き、空白/空行を整理する。
 * トークナイザが返す URL は末尾の句読点を含み得るので、剥がす側でも [trimUrlTail] 後の
 * 文字列と生の両方に当てる（"…jpg。" のような並びで句点だけ残るのを防ぐ）。
 */
fun removeUrls(content: String, urls: Collection<String>): String? {
    if (urls.isEmpty()) return content.ifBlank { null }
    var text = content
    urls.forEach { text = text.replace(it, "") }
    text = text.replace(Regex("""[ \t]{2,}"""), " ")
        .replace(Regex("""\n{3,}"""), "\n\n")
        .trim()
    return text.ifBlank { null }
}

/**
 * [#326] 設定に従って「実際にカード/プレイヤーを出す」埋め込みだけに絞る。
 *
 * 描画（LinkEmbeds）と本文の畳み込み（どのURLを消すか）で**同じ判定を使う**ためにここへ置く。
 * 別々に持つと「カードは出ていないのに URL だけ消えた」がいずれ起きる。
 */
fun visibleEmbeds(content: String, prefs: EmbedPrefs): List<LinkEmbed> =
    detectEmbeds(content).filter {
        when (it.kind) {
            EmbedKind.YOUTUBE -> prefs.youtube
            EmbedKind.SPOTIFY -> prefs.spotify
            EmbedKind.OGP -> prefs.ogp
            EmbedKind.VIDEO -> prefs.video
        }
    }

/** [#326] 本文から畳むべきカード化済みURL。[EmbedPrefs.hideCardedUrls] が false なら空。 */
fun cardedUrlsToHide(content: String, prefs: EmbedPrefs): List<String> =
    if (!prefs.hideCardedUrls) emptyList() else visibleEmbeds(content, prefs).map { it.url }

/** [#326] 本文中の動画URL（インラインプレイヤー/カルーセルに出す対象）。重複は除く。 */
fun videoUrlsIn(content: String): List<String> =
    tokenizeNostrContent(content).filterIsInstance<ContentToken.Url>()
        .map { trimUrlTail(it.url) }
        .filter { urlExtension(it) in VIDEO_EXT }
        .distinct()
