package app.nostrdeck.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Reply
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.nostrdeck.theme.DeckColors
import app.nostrdeck.theme.DeckSpace
import app.nostrdeck.theme.DeckType

/**
 * [#254] 返信先の1行プレビュー（◁ (アバター) 名前: 本文… を改行なしで1行）。
 *
 * **リプライと引用リポストの見た目を分けるための部品**。
 *  - リプライ … この1行プレビュー（軽い文脈表示。本文の主役は返信そのもの）
 *  - 引用     … 従来どおり [QuotedNoteCard]（引用元をカードとして見せる）
 *
 * 背景は塗らない。旧実装の Surface3 ピルは「細いラインが差し込まれた」ように見えて
 * 本文と干渉したため、[RepostHeader]（🔁 (アバター) 名前）と同じプレーンな Text3 の行にする。
 */
@Composable
internal fun ReplyContextLine(
    name: String?,
    content: String,
    modifier: Modifier = Modifier,
    // 返信元の著者アバター（分かる場合のみ。通知の対象スニペット等は null）。
    avatarSeed: String? = null,
    avatarUrl: String? = null,
    // [#254] ◁ アイコン。返信の文脈では true、通知のリアクション/リポスト対象行では false
    // （種別は左の絵文字/アイコンが担うため。サイズ・行の体裁は全種別で統一する）。
    showIcon: Boolean = true,
    // 右端の後置スロット（通知グループ行の時刻など）。
    trailing: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    val line = oneLine(content)
    if (line.isBlank() && name.isNullOrBlank()) return
    val label = if (name.isNullOrBlank()) line else if (line.isBlank()) name else "$name: $line"
    Row(
        modifier.fillMaxWidth()
            .let { if (onClick != null) it.clickable(onClick = onClick) else it },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showIcon) {
            Icon(
                Icons.AutoMirrored.Outlined.Reply, contentDescription = null,
                tint = DeckColors.Text3, modifier = Modifier.size(13.dp),
            )
            Spacer(Modifier.width(DeckSpace.Xs))
        }
        if (avatarSeed != null) {
            // 名前の文字高さに合わせた小さめアバター（RepostHeader と同じ 16dp）。
            Avatar(seed = avatarSeed, pictureUrl = avatarUrl, size = 16.dp)
            Spacer(Modifier.width(DeckSpace.Xs))
        }
        Text(
            label, color = DeckColors.Text3, fontSize = DeckType.Label,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        trailing?.let { Spacer(Modifier.width(DeckSpace.Sm)); it() }
    }
}

/**
 * 改行・連続空白を単一スペースへ潰して1行にする。
 * maxLines=1 のままだと改行以降が「切り捨て」になり、2行目の内容が省略記号にも出ないため
 * 明示的に潰しておく（仕様: 改行なしで1行 + 省略）。
 */
internal fun oneLine(s: String): String =
    s.replace('　', ' ').map { if (it == '\n' || it == '\r' || it == '\t') ' ' else it }
        .joinToString("").split(' ').filter { it.isNotEmpty() }.joinToString(" ")
