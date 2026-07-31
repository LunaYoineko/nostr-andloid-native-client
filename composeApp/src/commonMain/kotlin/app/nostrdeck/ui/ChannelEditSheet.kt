package app.nostrdeck.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import app.nostrdeck.theme.DeckColors
import app.nostrdeck.theme.DeckSpace
import app.nostrdeck.theme.DeckType
import nostr_deck_client.composeapp.generated.resources.Res
import nostr_deck_client.composeapp.generated.resources.channel_edit_title
import nostr_deck_client.composeapp.generated.resources.channel_create_note
import nostr_deck_client.composeapp.generated.resources.channel_create_submit
import nostr_deck_client.composeapp.generated.resources.channel_create_title
import nostr_deck_client.composeapp.generated.resources.channel_edit_submit
import nostr_deck_client.composeapp.generated.resources.channel_field_about
import nostr_deck_client.composeapp.generated.resources.channel_field_name
import nostr_deck_client.composeapp.generated.resources.channel_field_picture
import org.jetbrains.compose.resources.stringResource

/**
 * [#291] NIP-28 チャンネルの作成（kind:40）/ 編集（kind:41）モーダル。
 * name / about / picture(URL) を入力して onSubmit へ渡すだけの薄いフォーム。
 * 発行とローカル反映は Repository（createChannel / updateChannel）が担う。
 */
@Composable
fun ChannelEditSheet(
    // 編集時は既存値、作成時は null。
    initialName: String? = null,
    initialAbout: String? = null,
    initialPicture: String? = null,
    isEdit: Boolean = false,
    onSubmit: (name: String, about: String, picture: String?) -> Unit,
    onDismiss: () -> Unit,
) {
    var name by remember { mutableStateOf(initialName ?: "") }
    var about by remember { mutableStateOf(initialAbout ?: "") }
    var picture by remember { mutableStateOf(initialPicture ?: "") }

    AppModalSheet(
        title = stringResource(if (isEdit) Res.string.channel_edit_title else Res.string.channel_create_title),
        onDismiss = onDismiss,
    ) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState())) {
            if (!isEdit) {
                Text(
                    stringResource(Res.string.channel_create_note),
                    color = DeckColors.Text3, fontSize = DeckType.Label,
                )
                Spacer(Modifier.size(DeckSpace.Sm))
            }
            DeckTextField(
                value = name, onValueChange = { name = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = stringResource(Res.string.channel_field_name),
            )
            Spacer(Modifier.size(DeckSpace.Sm))
            DeckTextField(
                value = about, onValueChange = { about = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = stringResource(Res.string.channel_field_about),
            )
            Spacer(Modifier.size(DeckSpace.Sm))
            DeckTextField(
                value = picture, onValueChange = { picture = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = stringResource(Res.string.channel_field_picture),
            )
            Spacer(Modifier.size(DeckSpace.Md))
            DeckButton(
                stringResource(if (isEdit) Res.string.channel_edit_submit else Res.string.channel_create_submit),
                enabled = name.isNotBlank(),
                onClick = { onSubmit(name.trim(), about.trim(), picture.trim().ifBlank { null }) },
            )
            Spacer(Modifier.size(DeckSpace.Xl))
        }
    }
}
