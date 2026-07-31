package app.nostrdeck.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Reply
import androidx.compose.material.icons.outlined.AlternateEmail
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.Repeat
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.nostrdeck.crypto.currentUnixTime
import app.nostrdeck.model.ColumnSpec
import app.nostrdeck.model.NotificationKind
import app.nostrdeck.model.NotificationUi
import app.nostrdeck.state.DeckState
import app.nostrdeck.theme.DeckColors
import nostr_deck_client.composeapp.generated.resources.Res
import nostr_deck_client.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource
import app.nostrdeck.theme.DeckSpace
import app.nostrdeck.theme.DeckType
import app.nostrdeck.theme.DeckWeight

/**
 * [M10-notif] 通知（単一フィード・全幅）。自分(#p)宛のリプライ/メンション/リアクション/リポストを
 * 実データで新しい順に表示。タップで対象スレッド、アバター/名前で相手のプロフィールを開く。
 */
@Composable
fun NotificationsScreen(state: DeckState) {
    val repo = LocalRepository.current
    if (repo == null) {
        DetailPlaceholder(stringResource(Res.string.notif_unavailable))
        return
    }
    DisposableEffect(Unit) {
        repo.subscribeNotifications("notifications")
        onDispose { repo.unsubscribeColumn("notifications") }
    }
    val all = remember { repo.notificationsFeed() }.collectAsState().value
    // 通知タブ（全幅）は常にミュートを適用（カラムのような目トグルは無し）。
    val mute = rememberMuteMatcher()
    val items = all.filterNot { mute.muted(it) }

    Column(Modifier.fillMaxSize().background(DeckColors.Surface)) {
        ColumnHeader(
            title = stringResource(Res.string.tpl_notifications), subtitle = stringResource(Res.string.notif_subtitle),
            leadingIcon = Icons.Outlined.Notifications, pinned = false,
        )
        HorizontalDivider(color = DeckColors.Border)
        NotificationsBody(
            items, rememberLazyListState(),
            onNoticeClick = { n -> openNotificationTarget(state, n) },
            onActorClick = { pk -> state.openProfile(pk) },
            // [#254] 引っ張って更新: REQ を張り直してリレーから取り直す。
            onRefresh = { repo.unsubscribeColumn("notifications"); repo.subscribeNotifications("notifications") },
        )
    }
}

/** 通知の対象を開く。対象が kind:42 ならパブリックチャットのそのチャンネルを、他はスレッドを開く。 */
private fun openNotificationTarget(state: DeckState, n: NotificationUi) =
    openNotificationTarget(state, n.targetNoteId ?: n.id, n.targetChannelId)

private fun openNotificationTarget(state: DeckState, noteId: String, channelId: String?) {
    if (channelId != null) {
        state.clearDetail()
        state.navDest = app.nostrdeck.state.NavDest.CHANNELS
        state.publicChatRoom = channelId
    } else {
        state.openThreadDetail(noteId)
    }
}

/**
 * [M10-notif] 通知を Deck カラムとして表示（実データ）。通知タブと同じ `notificationsFeed()` を流す。
 * カラム購読は spec.id で行い、ピン/閉じる/並び替えは通常カラムと同じ。
 */
@Composable
fun NotificationsColumn(
    state: DeckState,
    spec: ColumnSpec,
    modifier: Modifier = Modifier,
    listState: LazyListState = rememberLazyListState(),
    onPin: (() -> Unit)? = null,
    onClose: (() -> Unit)? = null,
    menu: ColumnMenuActions? = null,
    mute: app.nostrdeck.model.MuteMatcher? = null,
    revealMuted: Boolean = false,
) {
    val repo = LocalRepository.current
    if (repo == null) {
        DetailPlaceholder(stringResource(Res.string.notif_unavailable))
        return
    }
    DisposableEffect(spec.id) {
        repo.subscribeNotifications(spec.id)
        onDispose { repo.unsubscribeColumn(spec.id) }
    }
    val all = remember(spec.id) { repo.notificationsFeed() }.collectAsState().value
    val items = if (revealMuted || mute == null) all else all.filterNot { mute.muted(it) }
    // [#222] 通知カラムも j/k 選択と Enter/o（対象を開く）に対応する。
    val selIdx = kbNotificationSelection(state, spec.id, items.size, listState) { i ->
        items.getOrNull(i)?.let { openNotificationTarget(state, it) }
    }
    Column(modifier.background(DeckColors.Surface)) {
        ColumnHeader(
            title = spec.title, subtitle = spec.subtitle,
            leadingIcon = columnIcon(spec.kind), pinned = spec.pinned,
            onPin = onPin, onClose = onClose, menu = menu,
        )
        HorizontalDivider(color = DeckColors.Border)
        NotificationsBody(
            items, listState,
            selectedIndex = selIdx,
            onNoticeClick = { n -> openNotificationTarget(state, n) },
            onActorClick = { pk -> state.openProfile(pk) },
            // [#254] 引っ張って更新: REQ を張り直してリレーから取り直す。
            onRefresh = { repo.unsubscribeColumn(spec.id); repo.subscribeNotifications(spec.id) },
        )
    }
}

/**
 * [#222] 通知カラムのキーボード選択配線。件数の通知・選択スクロール追従・OPEN の実行を担う。
 * REPLY/REPOST/REACT/BOOKMARK は通知行では対象が確定しないため黙って破棄する
 * （破棄しないと kbAction が残り続ける）。
 */
@Composable
private fun kbNotificationSelection(
    state: DeckState,
    columnId: String,
    count: Int,
    listState: LazyListState,
    onOpen: (Int) -> Unit,
): Int {
    val focused = state.kbFocusColumnId == columnId
    val raw = state.kbSelected[columnId] ?: -1
    val selectedIndex = if (focused && state.kbActive && raw in 0 until count) raw else -1

    androidx.compose.runtime.LaunchedEffect(columnId, count) { state.kbCount[columnId] = count }
    androidx.compose.runtime.LaunchedEffect(selectedIndex) {
        if (selectedIndex >= 0) runCatching { listState.animateScrollToItem(selectedIndex) }
    }
    androidx.compose.runtime.LaunchedEffect(state.kbAction) {
        val act = state.kbAction ?: return@LaunchedEffect
        if (act.first != columnId) return@LaunchedEffect
        val idx = state.kbSelected[columnId] ?: -1
        if (act.second == app.nostrdeck.state.KbAction.OPEN && idx in 0 until count) onOpen(idx)
        state.kbAction = null
    }
    return selectedIndex
}

@Composable
private fun NotificationsBody(
    items: List<NotificationUi>,
    listState: LazyListState,
    selectedIndex: Int = -1,   // [#222] キーボード選択中の行（-1=非選択）
    onNoticeClick: (NotificationUi) -> Unit,
    onActorClick: (String) -> Unit,
    onRefresh: (() -> Unit)? = null,   // [#254] 引っ張って更新
) {
    RefreshableBox(onRefresh) {
        if (items.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(stringResource(Res.string.notif_empty), color = DeckColors.Text3, fontSize = DeckType.Sub)
            }
        } else {
            LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                itemsIndexed(items, key = { _, it -> it.id }) { index, n ->
                    NoticeRow(
                        n,
                        selected = index == selectedIndex,
                        onClick = { onNoticeClick(n) },
                        onActorClick = { onActorClick(n.actor.pubkey) },
                    )
                }
            }
        }
    }
}

/**
 * [M10][#254] 通知1行（通知一覧 / ホームタイムラインのインライン通知で共用）。
 * Misskey 風: **アバターの右下に種別バッジ**（リアクション=その絵文字 / 🔁 / ⚡ / ↩ / @）を重ね、
 * 名前 + 時刻、下に本文（リプライ等）と対象投稿のグレー1行。グループ化はせず1件=1行で時系列を保つ。
 */
@Composable
fun NoticeRow(n: NotificationUi, selected: Boolean = false, onClick: () -> Unit, onActorClick: () -> Unit) {
    // [#222] キーボード選択ハイライト（NoteItem と同じ: 背景 Surface2 + 左 3dp アクセントバー）。
    val selFill = DeckColors.Surface2
    val selBar = DeckColors.Accent
    Row(
        Modifier.fillMaxWidth()
            .drawBehind {
                if (selected) {
                    drawRect(color = selFill)
                    drawRect(color = selBar, size = androidx.compose.ui.geometry.Size(3.dp.toPx(), size.height))
                }
            }
            .clickable(onClick = onClick).padding(DeckSpace.Md),
        verticalAlignment = Alignment.Top,
    ) {
        BadgedAvatar(n, onActorClick)
        Spacer(Modifier.width(DeckSpace.Sm))
        Column(Modifier.weight(1f)) {
            // 名前は残り幅いっぱい（長ければ…で省略）、時刻は右端に固定。
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    n.actor.name, color = DeckColors.Text, fontSize = DeckType.Sub, fontWeight = DeckWeight.Name,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).clickable(onClick = onActorClick),
                )
                Spacer(Modifier.width(DeckSpace.Sm))
                HintText(relativeTime(n.createdAt))
            }
            // 本文（相手の言葉/金額）。リアクション/リポストは無し（バッジが種別を担う）。
            val body = when (n.kind) {
                NotificationKind.REPLY, NotificationKind.MENTION -> n.text
                NotificationKind.ZAP -> "⚡ ${n.zapSats ?: 0} sats"
                else -> null
            }
            if (!body.isNullOrBlank()) {
                Spacer(Modifier.size(DeckSpace.Xs))
                // ノートと同じくリッチテキスト化（nostr: 参照を ↗… に短縮・URL/タグをリンク化）。
                Text(
                    noteAnnotated(body), color = DeckColors.Text2, fontSize = DeckType.Caption,
                    maxLines = 3, overflow = TextOverflow.Ellipsis,
                )
            }
            // 対象（自分の投稿）はグレーの1行（Misskey の引用風。テキストのみ・控えめ）。
            n.targetSnippet?.takeIf { it.isNotBlank() }?.let { snippet ->
                Spacer(Modifier.size(DeckSpace.Xs))
                Text(
                    oneLine(snippet), color = DeckColors.Text3, fontSize = DeckType.Label,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * [#254] アバター + 右下の種別バッジ（Misskey 風）。
 * リアクションは実際の絵文字（カスタム絵文字は画像）、他は種別アイコンを小円に載せる。
 */
@Composable
private fun BadgedAvatar(n: NotificationUi, onActorClick: () -> Unit) {
    Box {
        Avatar(
            n.actor.name, n.actor.pictureUrl,
            Modifier.padding(top = DeckSpace.Xs).clickable(onClick = onActorClick), size = 34.dp,
        )
        // バッジ: Surface 背景の小円で下地を作り、視認性を確保する。
        Box(
            Modifier.align(Alignment.BottomEnd)
                .background(DeckColors.Surface2, CircleShape)
                .padding(2.dp),
            contentAlignment = Alignment.Center,
        ) {
            when {
                n.kind == NotificationKind.REACTION && n.reactionImageUrl != null ->
                    // [#277] iOS/Desktop でも GIF/アニメ WebP を動かすため共通コンポーネントへ。
                    AnimatedEmoji(n.reactionImageUrl, contentDescription = n.reaction, modifier = Modifier.size(14.dp))
                n.kind == NotificationKind.REACTION ->
                    Text(n.reaction ?: "❤️", fontSize = DeckType.Label, maxLines = 1)
                else ->
                    Icon(kindIcon(n.kind), null, tint = kindTint(n.kind), modifier = Modifier.size(12.dp))
            }
        }
    }
}

private fun kindIcon(k: NotificationKind): ImageVector = when (k) {
    NotificationKind.REPLY -> Icons.AutoMirrored.Outlined.Reply
    NotificationKind.MENTION -> Icons.Outlined.AlternateEmail
    NotificationKind.REACTION -> Icons.Outlined.Favorite
    NotificationKind.REPOST -> Icons.Outlined.Repeat
    NotificationKind.ZAP -> Icons.Outlined.Bolt
}

private fun kindTint(k: NotificationKind): Color = when (k) {
    NotificationKind.REPLY, NotificationKind.MENTION -> DeckColors.Accent
    NotificationKind.REACTION -> DeckColors.Like
    NotificationKind.REPOST -> DeckColors.Boost  // テーマに馴染む控えめなグリーン
    NotificationKind.ZAP -> DeckColors.Zap
}

private fun relativeTime(createdAt: Long): String {
    val diff = currentUnixTime() - createdAt
    return when {
        diff < 10 -> "now"
        diff < 60 -> "${diff}s"
        diff < 3600 -> "${diff / 60}m"
        diff < 86400 -> "${diff / 3600}h"
        diff < 604800 -> "${diff / 86400}d"
        else -> "${diff / 604800}w"
    }
}
