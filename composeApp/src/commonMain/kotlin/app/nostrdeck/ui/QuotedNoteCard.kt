package app.nostrdeck.ui

import androidx.compose.foundation.background
import org.jetbrains.compose.resources.stringResource
import nostr_deck_client.composeapp.generated.resources.media_video_badge
import nostr_deck_client.composeapp.generated.resources.Res
import androidx.compose.material3.Icon
import androidx.compose.material.icons.outlined.PlayCircle
import androidx.compose.material.icons.Icons
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import coil3.request.crossfade
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.nostrdeck.model.NoteUi
import app.nostrdeck.theme.DeckColors
import app.nostrdeck.theme.DeckSpace
import app.nostrdeck.theme.DeckRadius
import app.nostrdeck.theme.DeckType
import app.nostrdeck.theme.DeckWeight

/** [M8-repost] 引用リポスト（NIP-18 q タグ）の埋め込みカード。著者名 + 切り詰めた本文を枠内に。モノクロ。 */
@Composable
fun QuotedNoteCard(
    note: NoteUi,
    modifier: Modifier = Modifier,
    // [#298] 1行モード。通知のリアクション/Zap 行で使う（本文1行・メディアは出さない）。
    compact: Boolean = false,
) {
    // [#124] カードタップで引用元イベントを開く（kind:1=スレッド / kind:30023=記事ビューワー）。
    // 従来はタップ不能で、nevent 参照の記事や引用元スレッドへ辿る導線が無かった。
    val nav = LocalNoteNav.current
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(DeckRadius.Md))
            .clickable(enabled = nav != null) { nav?.onEvent?.invoke(note.event.id) }
            .background(DeckColors.Surface2, RoundedCornerShape(DeckRadius.Md))
            .padding(DeckSpace.Sm),
    ) {
        // ヘッダは「アバター(小) + 名前」の横並び。アバターは文字サイズに合わせてコンパクト(16dp)。
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(seed = note.author.pubkey, pictureUrl = note.author.pictureUrl, size = 16.dp)
            Spacer(Modifier.width(DeckSpace.Xs))
            Text(
                note.author.name,
                color = DeckColors.Text2,
                fontSize = DeckType.Caption,
                fontWeight = DeckWeight.Name,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.size(DeckSpace.Xs))
        // 本文と同様に nostr:nevent/npub・#タグを短縮装飾する。
        // [#254] さらにカード内では:
        //  - 動画URL（mp4等）はテキストから除去してカルーセルに出す（imageUrlRegex 対象外のため残っていた）
        //  - 一般URL（x.com 等）はホスト+パスの短縮ラベルで表示（4行しかない本文を URL が占有しないように）
        val names = LocalProfileNames.current
        val rawBody = note.text ?: note.event.content
        val videos = remember(rawBody) { videoUrlRegex.findAll(rawBody).map { it.value }.toList().distinct() }
        val body = remember(rawBody) {
            var t = rawBody
            videos.forEach { t = t.replace(it, "") }
            t.replace(Regex("""[ \t]{2,}"""), " ").replace(Regex("""\n{3,}"""), "\n\n").trim()
        }
        if (body.isNotBlank()) {
            val annotated = remember(body, names) { noteAnnotated(body, { names[it] }, shortenUrls = true) }
            Text(
                annotated,
                color = DeckColors.Text2,
                fontSize = DeckType.Caption,
                lineHeight = 18.sp,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
            )
        }
        // [#254] メディア（画像+動画）はカルーセルで。画像はサムネイル、動画は ▶ プレースホルダ
        // （再生・フル表示は引用元を開いてから）。
        val media = if (compact) emptyList() else note.images + videos
        if (media.isNotEmpty()) {
            Spacer(Modifier.size(DeckSpace.Xs))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(DeckSpace.Xs)) {
                items(media.size) { i ->
                    val url = media[i]
                    val itemModifier =
                        if (media.size == 1) Modifier.fillParentMaxWidth() else Modifier.width(200.dp)
                    if (i < note.images.size) {
                        AsyncImage(
                            model = ImageRequest.Builder(LocalPlatformContext.current)
                                .data(ImageProxy.proxied(url, width = 640, quality = 80)).crossfade(true).build(),
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = itemModifier.height(140.dp).clip(RoundedCornerShape(DeckRadius.Sm)),
                        )
                    } else {
                        // 動画プレースホルダ（カード内では再生しない）。
                        Box(
                            itemModifier.height(140.dp).clip(RoundedCornerShape(DeckRadius.Sm))
                                .background(DeckColors.Bg),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Outlined.PlayCircle, contentDescription = null,
                                tint = DeckColors.Text2, modifier = Modifier.size(36.dp),
                            )
                            Text(
                                stringResource(Res.string.media_video_badge),
                                color = DeckColors.Text2, fontSize = DeckType.Label,
                                modifier = Modifier.align(Alignment.BottomEnd).padding(DeckSpace.Xs),
                            )
                        }
                    }
                }
            }
        }
    }
}
