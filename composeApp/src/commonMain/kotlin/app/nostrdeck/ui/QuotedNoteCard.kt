package app.nostrdeck.ui

import androidx.compose.foundation.background
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
fun QuotedNoteCard(note: NoteUi, modifier: Modifier = Modifier) {
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
        // 本文と同様に nostr:nevent/npub・URL・#タグを短縮装飾する。素の Text だと
        // 引用元本文に含まれる生の nostr:nevent1… が全長のまま表示されてしまう。
        val names = LocalProfileNames.current
        val body = note.text ?: note.event.content
        val annotated = remember(body, names) { noteAnnotated(body, { names[it] }) }
        Text(
            annotated,
            color = DeckColors.Text2,
            fontSize = DeckType.Caption,
            lineHeight = 18.sp,
            maxLines = 4,
            overflow = TextOverflow.Ellipsis,
        )
        // [#254] 画像付き投稿の引用が「殻」に見えないよう、先頭1枚だけサムネイル表示。
        // 2枚目以降は右下バッジで枚数を示す（フルのグリッドは引用元を開いてから）。
        note.images.firstOrNull()?.let { img ->
            Spacer(Modifier.size(DeckSpace.Xs))
            Box {
                AsyncImage(
                    model = ImageRequest.Builder(LocalPlatformContext.current)
                        .data(ImageProxy.proxied(img, width = 640, quality = 80)).crossfade(true).build(),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().height(140.dp).clip(RoundedCornerShape(DeckRadius.Sm)),
                )
                if (note.images.size > 1) {
                    Text(
                        "+${note.images.size - 1}",
                        color = DeckColors.Text,
                        fontSize = DeckType.Label,
                        modifier = Modifier.align(Alignment.BottomEnd).padding(DeckSpace.Xs)
                            .clip(RoundedCornerShape(DeckRadius.Sm))
                            .background(DeckColors.Bg.copy(alpha = 0.75f))
                            .padding(horizontal = DeckSpace.Xs, vertical = 1.dp),
                    )
                }
            }
        }
    }
}
