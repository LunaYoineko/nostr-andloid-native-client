package app.nostrdeck.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Reply
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.nostrdeck.theme.DeckColors
import app.nostrdeck.theme.DeckRadius
import app.nostrdeck.theme.DeckSpace
import app.nostrdeck.theme.DeckType

/**
 * [#254] 返信先の1行プレビュー（◁ アイコン + 「名前: 本文」を改行なしで1行）。
 *
 * **リプライと引用リポストの見た目を分けるための部品**。
 *  - リプライ … この1行プレビュー（軽い文脈表示。本文の主役は返信そのもの）
 *  - 引用     … 従来どおり [QuotedNoteCard]（引用元をカードとして見せる）
 *
 * 元は NIP-28 チャンネルの返信プレビュー（ChannelRoomColumn の ReplyQuote）だけが持っていた形。
 * kind:1 の返信（タイムライン/スレッド/投稿フォーム）でも同じ見た目に統一する。
 */
@Composable
internal fun ReplyContextLine(
    name: String?,
    content: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
) {
    val line = oneLine(content)
    if (line.isBlank() && name.isNullOrBlank()) return
    val label = if (name.isNullOrBlank()) line else if (line.isBlank()) name else "$name: $line"
    Row(
        modifier.fillMaxWidth()
            .clip(RoundedCornerShape(DeckRadius.Sm))
            .background(DeckColors.Surface3)
            .let { if (onClick != null) it.clickable(onClick = onClick) else it }
            .padding(horizontal = DeckSpace.Sm, vertical = DeckSpace.Xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.AutoMirrored.Outlined.Reply, contentDescription = null,
            tint = DeckColors.Text3, modifier = Modifier.size(11.dp),
        )
        Spacer(Modifier.width(DeckSpace.Xs))
        Text(
            label, color = DeckColors.Text3, fontSize = DeckType.Label,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * 改行・連続空白を単一スペースへ潰して1行にする。
 * maxLines=1 のままだと改行以降が「切り捨て」になり、2行目の内容が省略記号にも出ないため
 * 明示的に潰しておく（仕様: 改行なしで1行 + 省略）。
 */
private fun oneLine(s: String): String =
    s.replace('　', ' ').map { if (it == '\n' || it == '\r' || it == '\t') ' ' else it }
        .joinToString("").split(' ').filter { it.isNotEmpty() }.joinToString(" ")
