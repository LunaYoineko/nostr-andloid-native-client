package app.nostrdeck.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import coil3.request.crossfade

// Android: MainActivity の ImageLoader に GIF/アニメ WebP デコーダが載っているため
// AsyncImage で従来どおりアニメ表示できる。
@Composable
actual fun AnimatedEmoji(url: String, contentDescription: String?, modifier: Modifier) {
    AsyncImage(
        model = ImageRequest.Builder(LocalPlatformContext.current)
            .data(ImageProxy.proxied(url, width = 64, quality = 80, animated = true))
            .crossfade(true).build(),
        contentDescription = contentDescription,
        contentScale = ContentScale.Fit,
        modifier = modifier,
    )
}
