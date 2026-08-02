package app.nostrdeck.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit

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

/**
 * リアクション絵文字の表示サイズを、**文字とカスタム絵文字画像で揃える**ための変換。
 *
 * 通常の絵文字は文字なので `fontSize`（sp）で、カスタム絵文字は画像なので `size`（dp）で
 * 指定することになり、別々の数値を手打ちすると必ずズレる（実際、通知では 17dp 対 22sp で
 * カスタムだけ 77% の大きさになっていた）。さらに sp はアプリの「文字サイズ」設定
 * （fontScale への乗算）に連動するため、設定を上げると差が開いた。
 *
 * 画像側もこの関数を通して**同じ sp トークンから引く**ことで、数値の食い違いが起きず、
 * 文字サイズ設定にも一緒に追従する。
 *
 * ```
 * AnimatedEmoji(url, modifier = Modifier.size(DeckType.EmojiLg.asEmojiSize()))
 * Text(display, fontSize = DeckType.EmojiLg)
 * ```
 */
@Composable
@ReadOnlyComposable
fun TextUnit.asEmojiSize(): Dp = with(LocalDensity.current) { this@asEmojiSize.toDp() }
