package app.nostrdeck.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * [#277] NIP-30 カスタム絵文字の画像表示（GIF/アニメ WebP 対応）。
 *
 * Android は Coil(coil-gif) がアニメを担うため AsyncImage をそのまま使う。
 * iOS/Desktop の Coil にはアニメデコーダが無く GIF 絵文字が表示できなかったため、
 * Skia の Codec で自前デコードし、フレームを順に描画する actual を持つ。
 * 表示サイズは呼び出し側の [modifier]（size 指定）で決める。
 */
@Composable
expect fun AnimatedEmoji(url: String, contentDescription: String?, modifier: Modifier = Modifier)
