package app.nostrdeck.model

import kotlin.math.pow

/**
 * [#appearance] 文字サイズ（設定 > 表示）。「小」が従来のサイズ。
 * 倍率は fontScale に乗算され、sp 指定の全テキストへ波及する（dp 寸法・レイアウトは変えない）。
 * 老眼などで文字だけを大きくしたい人向け。文字だけのスケーリングはここに集約する。
 */
enum class TextScale(val id: String, val factor: Float) {
    SMALL("s", 1.0f),
    MEDIUM("m", 1.15f),
    LARGE("l", 1.35f);

    companion object {
        fun fromId(id: String?): TextScale = entries.firstOrNull { it.id == id } ?: SMALL
    }
}

/**
 * [#appearance] 表示サイズ（設定 > 表示）。「標準」が従来のサイズ。
 * 倍率は density に乗算され、dp 指定を含む UI 全体（アイコン・余白・カラム幅・
 * 下部ナビのアイコンなど）と文字がまとめて拡大する。文字だけの [TextScale] とは独立。
 * Android の「表示サイズ」設定と同じ考え方で、[TextScale] と掛け合わせて効く。
 */
enum class UiScale(val id: String, val factor: Float) {
    SMALL("s", 1.0f),
    MEDIUM("m", 1.15f),
    LARGE("l", 1.30f);

    companion object {
        fun fromId(id: String?): UiScale = entries.firstOrNull { it.id == id } ?: SMALL
    }
}

/**
 * [#247] 画像アップロード圧縮の設定（設定 > メディアサーバー）。
 * 投稿の「低/中」プリセットの長辺pxと再エンコード品質を変更できる（「高」は常に原寸・無加工）。
 * 既定: 低=640px / 中=1200px / 品質=85%。
 */
data class ImageCompressionPrefs(
    val lowMaxDim: Int = DEFAULT_LOW_DIM,
    val midMaxDim: Int = DEFAULT_MID_DIM,
    val quality: Int = DEFAULT_QUALITY,
) {
    companion object {
        const val DEFAULT_LOW_DIM = 640
        const val DEFAULT_MID_DIM = 1200
        const val DEFAULT_QUALITY = 85
        // 設定入力の許容範囲（外れた値は保存時にクランプする）
        const val MIN_DIM = 128
        const val MAX_DIM = 8192
        const val MIN_QUALITY = 30
        const val MAX_QUALITY = 100
        val DEFAULT = ImageCompressionPrefs()

        /** KV 保存値（不正/未設定は既定へ）からの復元。 */
        fun from(low: String?, mid: String?, quality: String?): ImageCompressionPrefs = ImageCompressionPrefs(
            lowMaxDim = low?.toIntOrNull()?.coerceIn(MIN_DIM, MAX_DIM) ?: DEFAULT_LOW_DIM,
            midMaxDim = mid?.toIntOrNull()?.coerceIn(MIN_DIM, MAX_DIM) ?: DEFAULT_MID_DIM,
            quality = quality?.toIntOrNull()?.coerceIn(MIN_QUALITY, MAX_QUALITY) ?: DEFAULT_QUALITY,
        )
    }
}

/**
 * [#248] 動画アップロード圧縮の設定（設定 > メディアサーバー）。
 * 投稿の「低/中」プリセットの縦解像度(p)を変更できる（「高」は常に無変換）。
 * 既定: 低=480p / 中=720p。iOS は最も近い標準プリセット（480/540/720/1080p）に丸められる。
 */
data class VideoCompressionPrefs(
    val lowHeight: Int = DEFAULT_LOW_HEIGHT,
    val midHeight: Int = DEFAULT_MID_HEIGHT,
) {
    companion object {
        const val DEFAULT_LOW_HEIGHT = 480
        const val DEFAULT_MID_HEIGHT = 720
        // 設定入力の許容範囲（外れた値は保存時にクランプする）
        const val MIN_HEIGHT = 240
        const val MAX_HEIGHT = 2160
        val DEFAULT = VideoCompressionPrefs()

        /** KV 保存値（不正/未設定は既定へ）からの復元。 */
        fun from(low: String?, mid: String?): VideoCompressionPrefs = VideoCompressionPrefs(
            lowHeight = low?.toIntOrNull()?.coerceIn(MIN_HEIGHT, MAX_HEIGHT) ?: DEFAULT_LOW_HEIGHT,
            midHeight = mid?.toIntOrNull()?.coerceIn(MIN_HEIGHT, MAX_HEIGHT) ?: DEFAULT_MID_HEIGHT,
        )
    }
}

/**
 * [#152] テーマ（設定 > 表示）。既定はダーク（従来挙動そのまま）。
 * SYSTEM は OS のダークモード設定に追従する。
 */
enum class ThemeMode(val id: String) {
    SYSTEM("system"),
    LIGHT("light"),
    DARK("dark"),
    /** [#258] ユーザー定義（背景/文字/アクセントの3色から全パレットを導出）。 */
    CUSTOM("custom");

    companion object {
        fun fromId(id: String?): ThemeMode = entries.firstOrNull { it.id == id } ?: DARK
    }
}

/**
 * [#258] カスタムテーマの3色（設定 > 表示）。ARGB を Int で保持する（Compose 非依存にするため）。
 * 残りのトークン（surface/border/text2,3/accent2,accentWeak…）は UI 層でこの3色から導出する。
 * プリセットは [CustomThemePrefs.PRESETS]。
 */
data class CustomThemePrefs(
    val bg: Int = 0xFF0C0C10.toInt(),
    val text: Int = 0xFFECEDF1.toInt(),
    val accent: Int = 0xFFFFFFFF.toInt(),
) {
    companion object {
        val DEFAULT = CustomThemePrefs()

        /** KV 保存値（hex 文字列）からの復元。不正値は既定。 */
        fun from(bg: String?, text: String?, accent: String?): CustomThemePrefs = CustomThemePrefs(
            bg = parseHex(bg) ?: DEFAULT.bg,
            text = parseHex(text) ?: DEFAULT.text,
            accent = parseHex(accent) ?: DEFAULT.accent,
        )

        /** "#RRGGBB" / "RRGGBB" / "#AARRGGBB" を ARGB Int へ。不正なら null。 */
        fun parseHex(s: String?): Int? {
            val h = s?.trim()?.removePrefix("#") ?: return null
            if (h.length != 6 && h.length != 8) return null
            val v = h.toLongOrNull(16) ?: return null
            return if (h.length == 6) (0xFF000000L or v).toInt() else v.toInt()
        }

        /** ARGB Int を "#RRGGBB" へ（設定UIの表示・保存用）。 */
        fun toHex(argb: Int): String {
            val rgb = argb and 0x00FFFFFF
            return "#" + rgb.toString(16).padStart(6, '0').uppercase()
        }

        /**
         * 相対輝度（WCAG）。0=黒 1=白。背景がダークかどうかの判定とコントラスト比に使う。
         */
        fun luminance(argb: Int): Double {
            fun ch(v: Int): Double {
                val c = v / 255.0
                return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
            }
            val r = ch((argb shr 16) and 0xFF)
            val g = ch((argb shr 8) and 0xFF)
            val b = ch(argb and 0xFF)
            return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }

        /** コントラスト比（1〜21）。本文可読性は 4.5 以上が目安（WCAG AA）。 */
        fun contrastRatio(a: Int, b: Int): Double {
            val la = luminance(a)
            val lb = luminance(b)
            val hi = kotlin.math.max(la, lb)
            val lo = kotlin.math.min(la, lb)
            return (hi + 0.05) / (lo + 0.05)
        }

        /** [#258] 名前付きプリセット（「ストア」の第一歩。Phase2 で NIP-78 共有）。 */
        val PRESETS: List<Triple<String, CustomThemePrefs, Boolean>> = listOf(
            Triple("Midnight", CustomThemePrefs(0xFF0C0C10.toInt(), 0xFFECEDF1.toInt(), 0xFFFFFFFF.toInt()), true),
            Triple("Paper", CustomThemePrefs(0xFFF7F6F2.toInt(), 0xFF1A1A1E.toInt(), 0xFF1A1A1E.toInt()), false),
            Triple("Solar", CustomThemePrefs(0xFF002B36.toInt(), 0xFF93A1A1.toInt(), 0xFFB58900.toInt()), true),
            Triple("Forest", CustomThemePrefs(0xFF0E1A14.toInt(), 0xFFE2EDE6.toInt(), 0xFF4FA77A.toInt()), true),
            Triple("Sakura", CustomThemePrefs(0xFFFDF3F5.toInt(), 0xFF2A1E22.toInt(), 0xFFC2557A.toInt()), false),
        )
    }
}
