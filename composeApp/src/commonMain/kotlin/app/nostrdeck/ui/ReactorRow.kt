package app.nostrdeck.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.nostrdeck.model.Profile
import app.nostrdeck.theme.DeckColors
import app.nostrdeck.theme.DeckSpace
import app.nostrdeck.theme.DeckType

/**
 * [#254] 反応1種の行: 先頭アイコン + 件数ラベル + した人のアバター列（多すぎる分は +N）。
 * 投稿詳細(FocusNoteStats)と通知のグループ行で共用。
 */
@Composable
internal fun ReactorRow(
    leading: @Composable () -> Unit,
    label: String,
    people: List<Profile>,
    onAuthorClick: ((String) -> Unit)? = null,
) {
    val maxAvatars = 12
    Row(
        Modifier.fillMaxWidth().padding(top = DeckSpace.Xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) { leading() }
        Spacer(Modifier.width(DeckSpace.Xs))
        Text(label, color = DeckColors.Text3, fontSize = DeckType.Label)
        Spacer(Modifier.width(DeckSpace.Sm))
        Row(verticalAlignment = Alignment.CenterVertically) {
            people.take(maxAvatars).forEach { p ->
                Avatar(
                    seed = p.pubkey, pictureUrl = p.pictureUrl, size = 20.dp,
                    modifier = Modifier.padding(end = 3.dp)
                        .let { m -> if (onAuthorClick != null) m.clickable { onAuthorClick(p.pubkey) } else m },
                )
            }
            if (people.size > maxAvatars) {
                Text("+${people.size - maxAvatars}", color = DeckColors.Text3, fontSize = DeckType.Label)
            }
        }
    }
}
