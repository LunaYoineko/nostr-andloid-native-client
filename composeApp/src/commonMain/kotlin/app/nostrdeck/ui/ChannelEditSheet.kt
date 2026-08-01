package app.nostrdeck.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.nostrdeck.model.ImageCompressionPrefs
import app.nostrdeck.theme.DeckDimens
import app.nostrdeck.theme.DeckRadius
import kotlinx.coroutines.launch
import nostr_deck_client.composeapp.generated.resources.channel_icon_clear
import nostr_deck_client.composeapp.generated.resources.channel_icon_pick
import nostr_deck_client.composeapp.generated.resources.channel_icon_upload_failed
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
            // [#301] アイコン画像。端末から選ぶ → 中サイズへ圧縮 → メディアサーバーへ
            // アップロードし、返った URL を欄へ入れる。URL の直接入力も従来どおりできる。
            ChannelIconField(
                name = name,
                url = picture,
                onUrlChange = { picture = it },
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

/**
 * [#301] スレッドのアイコン画像フィールド。
 *
 * 一覧に並んだときと同じ角丸の四角でサムネイルを出し、選んだ結果をその場で確認できる。
 * 画像は投稿と同じ「中」品質へ圧縮してからアップロードする（アイコン用途に原寸は要らない）。
 * メディアサーバーが未設定だとアップロードは失敗するので、その場合は理由を出す。
 */
@Composable
private fun ChannelIconField(
    name: String,
    url: String,
    onUrlChange: (String) -> Unit,
) {
    val repo = LocalRepository.current
    val scope = rememberCoroutineScope()
    val toast = rememberToaster()
    val imgPrefs by (
        repo?.imageCompressionFlow()?.collectAsState()
            ?: remember { mutableStateOf(ImageCompressionPrefs.DEFAULT) }
        )
    var uploading by remember { mutableStateOf(false) }
    val failMsg = stringResource(Res.string.channel_icon_upload_failed)

    val picker = rememberImagePicker { picked ->
        val p = picked.firstOrNull() ?: return@rememberImagePicker
        uploading = true
        scope.launch {
            // 中サイズへ圧縮してから上げる。失敗しても元の画像で上げ直さない（意図せず巨大化するため）。
            val shrunk = runCatching {
                processImage(p, imgPrefs.maxDimFor(ImageResolution.MID), imgPrefs.quality)
            }.getOrDefault(p)
            val uploaded = repo?.uploadImage(shrunk.bytes, shrunk.mime, shrunk.name)
            if (uploaded.isNullOrBlank()) toast(failMsg) else onUrlChange(uploaded)
            uploading = false
        }
    }

    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        // 一覧と同じ見え方のサムネ（未設定なら頭文字プレースホルダ）。
        Box(
            Modifier.size(DeckDimens.AvatarSize)
                .clip(RoundedCornerShape(DeckRadius.Md))
                .background(DeckColors.Surface3),
            contentAlignment = Alignment.Center,
        ) {
            if (uploading) {
                CircularProgressIndicator(
                    color = DeckColors.Text3, strokeWidth = 2.dp,
                    modifier = Modifier.size(DeckDimens.IconSm),
                )
            } else {
                AvatarSquare(name.ifBlank { "?" }, url.ifBlank { null })
            }
        }
        Spacer(Modifier.size(DeckSpace.Sm))
        DeckTextField(
            value = url, onValueChange = onUrlChange,
            modifier = Modifier.weight(1f),
            placeholder = stringResource(Res.string.channel_field_picture),
        )
        Spacer(Modifier.size(DeckSpace.Sm))
        DeckGhostButton(
            stringResource(Res.string.channel_icon_pick),
            enabled = !uploading,
            onClick = { picker.launch() },
        )
        if (url.isNotBlank() && !uploading) {
            IconButton(onClick = { onUrlChange("") }) {
                Icon(
                    Icons.Outlined.Close,
                    contentDescription = stringResource(Res.string.channel_icon_clear),
                    tint = DeckColors.Text3,
                )
            }
        }
    }
}
