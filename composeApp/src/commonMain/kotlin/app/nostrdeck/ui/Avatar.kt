package app.nostrdeck.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.nostrdeck.theme.DeckColors
import app.nostrdeck.theme.DeckRadius
import app.nostrdeck.theme.DeckType
import app.nostrdeck.theme.DeckWeight
import app.nostrdeck.theme.DeckDimens
import coil3.compose.AsyncImage
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import coil3.request.crossfade
import kotlin.math.abs

/**
 * アバター。[pictureUrl] があればプロキシ経由で読み（Coil がローカルキャッシュ）、
 * 無ければグラデーション禁止のモノクロ1色＋イニシャル。
 *
 * [#378] にゃにゃにゃウイルス: [pubkey]（hex。分かる呼び出し元だけが渡す）が
 * [Nyan.appliesTo] に該当すると猫耳が付く。外形サイズ [size] は変えず、円を少し
 * 小さく下寄せで描いて上の帯に耳を描くため、呼び出し側のクリップでは切れない。
 */
@Composable
fun Avatar(
    seed: String,
    pictureUrl: String? = null,
    modifier: Modifier = Modifier,
    size: androidx.compose.ui.unit.Dp = DeckDimens.AvatarSize,
    pubkey: String? = null,
) {
    if (!Nyan.appliesTo(pubkey)) {
        AvatarCircle(seed, pictureUrl, modifier.size(size))
        return
    }
    Box(modifier.size(size)) {
        // 耳は円より先に描き、根元を円の下へ隠して「生えている」見た目にする。
        CatEars(monoShade(seed), Modifier.fillMaxSize())
        AvatarCircle(
            seed, pictureUrl,
            Modifier.fillMaxSize(NYAN_CIRCLE_FRACTION).align(Alignment.BottomCenter),
        )
    }
}

/** 丸アバター本体（画像 or イニシャル）。サイズは [modifier] 側で決める。 */
@Composable
private fun AvatarCircle(seed: String, pictureUrl: String?, modifier: Modifier) {
    val shape = CircleShape
    if (!pictureUrl.isNullOrBlank()) {
        AsyncImage(
            model = ImageRequest.Builder(LocalPlatformContext.current)
                .data(ImageProxy.proxied(pictureUrl, width = 256, quality = 80, animated = true))
                .crossfade(true).build(),
            contentDescription = seed,
            modifier = modifier.clip(shape).background(DeckColors.Surface3),
            contentScale = ContentScale.Crop,
        )
    } else {
        Box(
            modifier.clip(shape).background(monoShade(seed)),
            contentAlignment = Alignment.Center,
        ) { Initial(seed) }
    }
}

/** [#378] 猫耳モード時の円の縮小率（残りが耳の帯になる）。 */
private const val NYAN_CIRCLE_FRACTION = 0.86f

/** [#378] 内耳の色。無彩色の外耳に対して淡いピンク（ダーク/ライト両テーマで沈まない）。 */
private val NyanInnerEar = Color(0xFFE8A7B7)

/**
 * [#378] 三角の猫耳2つ。下寄せ 86% の円（半径 r=0.43×短辺）の上縁に、
 * 中心から ±38° 傾けて描く。根元（0.80r）は円内に埋め、先端（1.52r）だけ帯へ出す。
 * 外耳の色は [monoShade] 由来 = イニシャルアバターと同系の無彩色。
 */
@Composable
private fun CatEars(earColor: Color, modifier: Modifier) {
    Canvas(modifier) {
        val s = size.minDimension
        val r = NYAN_CIRCLE_FRACTION / 2f * s
        val cx = size.width / 2f
        val cy = size.height - r
        for (sign in floatArrayOf(-1f, 1f)) {
            rotate(degrees = sign * 38f, pivot = Offset(cx, cy)) {
                drawPath(earPath(cx, cy, r, halfW = 0.34f, base = 0.80f, tip = 1.52f), earColor)
                drawPath(earPath(cx, cy, r, halfW = 0.17f, base = 0.95f, tip = 1.33f), NyanInnerEar)
            }
        }
    }
}

/** 円の中心 (cx,cy)・半径 r を基準に、真上向きの二等辺三角形（耳）を作る。 */
private fun earPath(cx: Float, cy: Float, r: Float, halfW: Float, base: Float, tip: Float): Path =
    Path().apply {
        moveTo(cx - halfW * r, cy - base * r)
        lineTo(cx + halfW * r, cy - base * r)
        lineTo(cx, cy - tip * r)
        close()
    }

/** 角丸四角版（チャンネルアイコン等）。親 Box を満たす。猫耳の対象外。 */
@Composable
fun AvatarSquare(seed: String, pictureUrl: String? = null, modifier: Modifier = Modifier) {
    if (!pictureUrl.isNullOrBlank()) {
        AsyncImage(
            model = ImageRequest.Builder(LocalPlatformContext.current)
                .data(ImageProxy.proxied(pictureUrl, width = 128, quality = 80, animated = true))
                .crossfade(true).build(),
            contentDescription = seed,
            modifier = modifier.fillMaxSize().clip(RoundedCornerShape(DeckRadius.Md)),
            contentScale = ContentScale.Crop,
        )
    } else {
        Box(
            modifier.fillMaxSize().clip(RoundedCornerShape(DeckRadius.Md)).background(monoShade(seed)),
            contentAlignment = Alignment.Center,
        ) { Initial(seed) }
    }
}

@Composable
private fun Initial(seed: String) {
    val ch = seed.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?"
    Text(ch, color = DeckColors.Text, fontWeight = DeckWeight.Strong, fontSize = DeckType.Body)
}

/** seed → 無彩色のグレー（明度のみ変化、色相なし）。 */
private fun monoShade(seed: String): Color {
    var h = 0
    for (c in seed) h = (h * 31 + c.code)
    val v = 56 + (abs(h) % 56)   // 56..111 のダークグレー帯
    return Color(v / 255f, v / 255f, v / 255f)
}
