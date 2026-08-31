package app.nostrdeck.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import app.nostrdeck.crypto.Nip19
import app.nostrdeck.data.Nip22
import app.nostrdeck.model.NostrEvent
import app.nostrdeck.theme.DeckColors
import app.nostrdeck.theme.DeckRadius
import app.nostrdeck.theme.DeckSpace
import app.nostrdeck.theme.DeckType
import nostr_deck_client.composeapp.generated.resources.Res
import nostr_deck_client.composeapp.generated.resources.comment_root_kind_fmt
import nostr_deck_client.composeapp.generated.resources.comment_root_loading
import nostr_deck_client.composeapp.generated.resources.comment_root_url_fmt
import org.jetbrains.compose.resources.stringResource

/**
 * [#380] NIP-22 コメントスレッドの「根のカード」。
 * kind:1111 のツリーはルートが非ノート（記事30023 / 外部URL / 任意 kind）になり得るため、
 * スレッド先頭にルートの正体を小さく出す。
 *  - ルートが記事(30023) … 既存の記事カード（タップで記事リーダーへ）
 *  - ルートがイベントで kind:1/1111 … 何も出さない（ツリー本体に行として並ぶ）
 *  - 外部URL(I タグ) … URL カード（タップでブラウザ）
 *  - それ以外/未取得 … 汎用カード（kind 番号 / 取得中）
 *
 * [focus] はタップされた kind:1111 イベント（タグは完全な形で渡すこと）。
 */
@Composable
internal fun CommentRootCard(focus: NostrEvent, modifier: Modifier = Modifier) {
    val tags = focus.tags
    val rootA = Nip22.rootAddressOf(tags)
    val rootE = Nip22.rootEventIdOf(tags)
    val rootI = Nip22.rootExternalOf(tags)
    val rootK = Nip22.rootKindOf(tags)
    val repo = LocalRepository.current
    val nav = LocalNoteNav.current

    Column(modifier.fillMaxWidth()) {
        when {
            // ルートが addressable（記事等）。30023 は記事カード、他は汎用カード。
            rootA != null -> {
                val parts = remember(rootA) { rootA.split(":") }
                val kind = parts.getOrNull(0)?.toIntOrNull()
                if (kind == 30023 && parts.size >= 3) {
                    val hint = tags.firstOrNull { it.size >= 3 && it[0] == "A" }?.get(2)
                        ?.takeIf { it.isNotEmpty() }
                    Box(Modifier.padding(horizontal = DeckSpace.Md, vertical = DeckSpace.Sm)) {
                        ArticleEmbedCard(
                            Nip19.AddrRef(kind, parts[1], parts.drop(2).joinToString(":"), listOfNotNull(hint)),
                        )
                    }
                } else {
                    GenericRootCard(stringResource(Res.string.comment_root_kind_fmt, (kind ?: rootK ?: "?").toString()))
                }
                HorizontalDivider(color = DeckColors.Border)
            }
            // ルートがイベント id。取得済みならその kind で出し分け、未取得なら取得を促して汎用表示。
            rootE != null -> {
                val event = repo?.let { r -> remember(rootE) { r.eventByIdFlow(rootE) } }
                    ?.collectAsState(null)?.value
                LaunchedEffect(rootE, event == null) {
                    if (event == null) {
                        val hint = tags.firstOrNull { it.size >= 3 && it[0] == "E" }?.get(2)
                            ?.takeIf { it.isNotEmpty() }
                        repo?.requestEvent(rootE, listOfNotNull(hint))
                    }
                }
                when {
                    // kind:1/1111 のルートはツリー本体に行として出るのでカードは不要。
                    event != null && (event.kind == 1 || event.kind == Nip22.KIND) -> Unit
                    event != null && event.kind == 30023 -> {
                        Box(Modifier.padding(horizontal = DeckSpace.Md, vertical = DeckSpace.Sm)) {
                            ArticleCardBody(
                                event,
                                Modifier.fillMaxWidth()
                                    .clip(RoundedCornerShape(DeckRadius.Md))
                                    .clickable(enabled = nav != null) { nav?.onEvent?.invoke(rootE) }
                                    .background(DeckColors.Surface2, RoundedCornerShape(DeckRadius.Md)),
                            )
                        }
                        HorizontalDivider(color = DeckColors.Border)
                    }
                    event != null -> {
                        GenericRootCard(
                            stringResource(Res.string.comment_root_kind_fmt, event.kind.toString()),
                            onClick = nav?.let { { it.onEvent(rootE) } },
                        )
                        HorizontalDivider(color = DeckColors.Border)
                    }
                    else -> {
                        // 未取得。K タグがあれば kind だけでも文脈を出す。
                        GenericRootCard(
                            if (rootK != null) stringResource(Res.string.comment_root_kind_fmt, rootK.toString())
                            else stringResource(Res.string.comment_root_loading),
                        )
                        HorizontalDivider(color = DeckColors.Border)
                    }
                }
            }
            // 外部URL等（I タグ）。http(s) ならタップでブラウザへ。
            rootI != null -> {
                val uriHandler = LocalUriHandler.current
                val isUrl = rootI.startsWith("http://") || rootI.startsWith("https://")
                GenericRootCard(
                    stringResource(Res.string.comment_root_url_fmt, externalRefLabel(rootI)),
                    subtitle = if (isUrl) rootI else null,
                    onClick = if (isUrl) ({ runCatching { uriHandler.openUri(rootI) } }) else null,
                )
                HorizontalDivider(color = DeckColors.Border)
            }
        }
    }
}

/** 汎用の根カード（kind 番号 / URL / 取得中）。小さな淡色ボックス1つ。 */
@Composable
private fun GenericRootCard(label: String, subtitle: String? = null, onClick: (() -> Unit)? = null) {
    Column(
        Modifier.fillMaxWidth()
            .padding(horizontal = DeckSpace.Md, vertical = DeckSpace.Sm)
            .clip(RoundedCornerShape(DeckRadius.Md))
            .let { if (onClick != null) it.clickable(onClick = onClick) else it }
            .background(DeckColors.Surface2, RoundedCornerShape(DeckRadius.Md))
            .padding(DeckSpace.Sm),
    ) {
        Text(label, color = DeckColors.Text2, fontSize = DeckType.Caption)
        if (subtitle != null) {
            Text(subtitle, color = DeckColors.Text3, fontSize = DeckType.Label, maxLines = 1)
        }
    }
}
