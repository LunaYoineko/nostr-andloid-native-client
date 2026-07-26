package app.nostrdeck.model

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sign

/**
 * [#140] blurhash デコーダ（woltapp/blurhash のアルゴリズムの純 Kotlin 移植）。
 * imeta の blurhash 文字列を小さな ARGB ピクセル配列へ展開し、
 * 画像/動画の読み込み中プレースホルダに使う。展開サイズは 16〜32px 程度で十分
 * （描画時に拡大され、元々ぼかし表現なので粗さは見えない）。
 */
object Blurhash {
    private const val CHARS =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#\$%*+,-.:;=?@[]^_{|}~"
    private val REV = IntArray(128) { -1 }.also { r -> CHARS.forEachIndexed { i, c -> r[c.code] = i } }

    /** base83 の部分文字列を数値へ。不正文字を含めば -1。 */
    private fun decode83(s: String, from: Int, to: Int): Int {
        var v = 0
        for (i in from until to) {
            val c = s[i].code
            val d = if (c < 128) REV[c] else -1
            if (d < 0) return -1
            v = v * 83 + d
        }
        return v
    }

    /**
     * ARGB(8888) のピクセル配列に展開する。壊れた入力は null（表示側は単色にフォールバック）。
     * @param punch コントラスト係数（1=標準）
     */
    fun decode(blurhash: String, width: Int, height: Int, punch: Float = 1f): IntArray? {
        if (width <= 0 || height <= 0) return null
        if (blurhash.length < 6) return null
        val sizeFlag = decode83(blurhash, 0, 1)
        if (sizeFlag < 0) return null
        val numY = sizeFlag / 9 + 1
        val numX = sizeFlag % 9 + 1
        if (blurhash.length != 4 + 2 * numX * numY) return null
        val quantMax = decode83(blurhash, 1, 2)
        if (quantMax < 0) return null
        val maxAc = (quantMax + 1) / 166f

        // DC（平均色）+ AC（コサイン係数）。
        val colors = FloatArray(numX * numY * 3)
        val dc = decode83(blurhash, 2, 6)
        if (dc < 0) return null
        colors[0] = srgbToLinear((dc shr 16) and 255)
        colors[1] = srgbToLinear((dc shr 8) and 255)
        colors[2] = srgbToLinear(dc and 255)
        for (i in 1 until numX * numY) {
            val v = decode83(blurhash, 4 + i * 2, 6 + i * 2)
            if (v < 0) return null
            colors[i * 3] = signPow((v / (19 * 19) - 9) / 9f) * maxAc * punch
            colors[i * 3 + 1] = signPow((v / 19 % 19 - 9) / 9f) * maxAc * punch
            colors[i * 3 + 2] = signPow((v % 19 - 9) / 9f) * maxAc * punch
        }

        val pixels = IntArray(width * height)
        for (y in 0 until height) {
            for (x in 0 until width) {
                var r = 0f
                var g = 0f
                var b = 0f
                for (j in 0 until numY) {
                    val basisY = cos(PI.toFloat() * y * j / height)
                    for (i in 0 until numX) {
                        val basis = cos(PI.toFloat() * x * i / width) * basisY
                        val idx = (i + j * numX) * 3
                        r += colors[idx] * basis
                        g += colors[idx + 1] * basis
                        b += colors[idx + 2] * basis
                    }
                }
                pixels[y * width + x] = (255 shl 24) or
                    (linearToSrgb(r) shl 16) or (linearToSrgb(g) shl 8) or linearToSrgb(b)
            }
        }
        return pixels
    }

    private fun srgbToLinear(v: Int): Float {
        val f = v / 255f
        return if (f <= 0.04045f) f / 12.92f else ((f + 0.055f) / 1.055f).pow(2.4f)
    }

    private fun linearToSrgb(v: Float): Int {
        val c = v.coerceIn(0f, 1f)
        val f = if (c <= 0.0031308f) c * 12.92f else 1.055f * c.pow(1 / 2.4f) - 0.055f
        return (f * 255f + 0.5f).toInt().coerceIn(0, 255)
    }

    private fun signPow(v: Float): Float = sign(v) * abs(v).pow(2f)
}
