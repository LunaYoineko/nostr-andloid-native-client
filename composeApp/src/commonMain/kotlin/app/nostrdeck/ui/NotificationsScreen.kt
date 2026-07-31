package app.nostrdeck.ui

import androidx.compose.foundation.background
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
        val entries = remember(items) { buildNotifEntries(items) }
        NotificationsBody(
            entries, rememberLazyListState(),
            onNoticeClick = { n -> openNotificationTarget(state, n) },
            onOpenTarget = { noteId, channelId -> openNotificationTarget(state, noteId, channelId) },
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
 * [#254] 通知の表示エントリ。リアクション/リポスト/Zap は **対象投稿ごとに1グループ**へ
 * 集約する（Slack の通知欄風）。リプライ/メンションは本文があるので従来どおり個別行。
 */
internal sealed interface NotifEntry {
    val sortAt: Long
    val key: String

    data class Single(val n: NotificationUi) : NotifEntry {
        override val sortAt get() = n.createdAt
        override val key get() = "s_" + n.id
    }

    data class Group(
        val targetNoteId: String,
        val targetChannelId: String?,
        val targetAuthor: app.nostrdeck.model.Profile?,
        val snippet: String?,
        override val sortAt: Long,
        val reactions: List<app.nostrdeck.model.ReactionGroupUi>,
        val reposters: List<app.nostrdeck.model.Profile>,
        val zapSats: Long,
        val zappers: List<app.nostrdeck.model.Profile>,
    ) : NotifEntry {
        override val key get() = "g_" + targetNoteId
    }
}

/** 通知リスト → 表示エントリ列。グループの位置は最新の反応時刻。取得できた分だけで集約する。 */
internal fun buildNotifEntries(items: List<NotificationUi>): List<NotifEntry> {
    val groupKinds = setOf(NotificationKind.REACTION, NotificationKind.REPOST, NotificationKind.ZAP)
    val (groupable, singles) = items.partition { it.kind in groupKinds && it.targetNoteId != null }
    val groups = groupable.groupBy { it.targetNoteId!! }.map { (targetId, list) ->
        val reactions = list.filter { it.kind == NotificationKind.REACTION }
            .groupBy { (it.reaction ?: "❤️") to it.reactionImageUrl }
            .map { (k, l) ->
                app.nostrdeck.model.ReactionGroupUi(
                    display = k.first, imageUrl = k.second,
                    people = l.sortedByDescending { it.createdAt }.map { it.actor }.distinctBy { it.pubkey },
                )
            }
            .sortedByDescending { it.people.size }
        val zaps = list.filter { it.kind == NotificationKind.ZAP }
        NotifEntry.Group(
            targetNoteId = targetId,
            targetChannelId = list.firstNotNullOfOrNull { it.targetChannelId },
            targetAuthor = list.firstNotNullOfOrNull { it.targetAuthor },
            snippet = list.firstNotNullOfOrNull { it.targetSnippet },
            sortAt = list.maxOf { it.createdAt },
            reactions = reactions,
            reposters = list.filter { it.kind == NotificationKind.REPOST }
                .sortedByDescending { it.createdAt }.map { it.actor }.distinctBy { it.pubkey },
            zapSats = zaps.sumOf { it.zapSats ?: 0L },
            zappers = zaps.sortedByDescending { it.createdAt }.map { it.actor }.distinctBy { it.pubkey },
        )
    }
    return (singles.map { NotifEntry.Single(it) } + groups).sortedByDescending { it.sortAt }
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
    val entries = remember(items) { buildNotifEntries(items) }
    // [#222] 通知カラムも j/k 選択と Enter/o（対象を開く）に対応する。
    val selIdx = kbNotificationSelection(state, spec.id, entries.size, listState) { i ->
        when (val e = entries.getOrNull(i)) {
            is NotifEntry.Single -> openNotificationTarget(state, e.n)
            is NotifEntry.Group -> openNotificationTarget(state, e.targetNoteId, e.targetChannelId)
            null -> Unit
        }
    }
    Column(modifier.background(DeckColors.Surface)) {
        ColumnHeader(
            title = spec.title, subtitle = spec.subtitle,
            leadingIcon = columnIcon(spec.kind), pinned = spec.pinned,
            onPin = onPin, onClose = onClose, menu = menu,
        )
        HorizontalDivider(color = DeckColors.Border)
        NotificationsBody(
            entries, listState,
            selectedIndex = selIdx,
            onNoticeClick = { n -> openNotificationTarget(state, n) },
            onOpenTarget = { noteId, channelId -> openNotificationTarget(state, noteId, channelId) },
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
    entries: List<NotifEntry>,
    listState: LazyListState,
    selectedIndex: Int = -1,   // [#222] キーボード選択中の行（-1=非選択）
    onNoticeClick: (NotificationUi) -> Unit,
    onOpenTarget: (String, String?) -> Unit,
    onActorClick: (String) -> Unit,
    onRefresh: (() -> Unit)? = null,   // [#254] 引っ張って更新
) {
    RefreshableBox(onRefresh) {
        if (entries.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(stringResource(Res.string.notif_empty), color = DeckColors.Text3, fontSize = DeckType.Sub)
            }
        } else {
            LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                itemsIndexed(entries, key = { _, it -> it.key }) { index, e ->
                    when (e) {
                        is NotifEntry.Single -> NoticeRow(
                            e.n,
                            selected = index == selectedIndex,
                            onClick = { onNoticeClick(e.n) },
                            onActorClick = { onActorClick(e.n.actor.pubkey) },
                        )
                        is NotifEntry.Group -> NotifGroupRow(
                            e,
                            selected = index == selectedIndex,
                            onClick = { onOpenTarget(e.targetNoteId, e.targetChannelId) },
                            onActorClick = onActorClick,
                        )
                    }
                }
            }
        }
    }
}

/**
 * [#254] リアクション/リポスト/Zap の対象投稿ごとのグループ行（Slack の通知欄風）。
 * 先頭に対象の極小1行、下に「絵文字 + 件数 + した人のアバター列」「🔁 …」「⚡ 合計 …」。
 * 取得できた分だけで集約する（全リレーの網羅は保証しない）。
 */
@Composable
private fun NotifGroupRow(
    g: NotifEntry.Group,
    selected: Boolean = false,
    onClick: () -> Unit,
    onActorClick: (String) -> Unit,
) {
    val selFill = DeckColors.Surface2
    val selBar = DeckColors.Accent
    Column(
        Modifier.fillMaxWidth()
            .drawBehind {
                if (selected) {
                    drawRect(color = selFill)
                    drawRect(color = selBar, size = androidx.compose.ui.geometry.Size(3.dp.toPx(), size.height))
                }
            }
            .clickable(onClick = onClick).padding(DeckSpace.Md),
    ) {
        // 対象の1行（単発行と同じ体裁: 16dpアバター + Label）+ 右端に最新の反応時刻。
        ReplyContextLine(
            name = null,
            content = g.snippet ?: "",
            avatarSeed = g.targetAuthor?.pubkey,
            avatarUrl = g.targetAuthor?.pictureUrl,
            showIcon = false,
            trailing = { HintText(relativeTime(g.sortAt)) },
            modifier = Modifier.padding(bottom = DeckSpace.Xs),
        )
        // 絵文字ごとのリアクション。
        g.reactions.forEach { r ->
            ReactorRow(
                leading = {
                    if (r.imageUrl != null) {
                        AnimatedEmoji(r.imageUrl, contentDescription = r.display, modifier = Modifier.size(18.dp))
                    } else {
                        Text(r.display, fontSize = DeckType.Sub, maxLines = 1)
                    }
                },
                label = "${r.people.size}", people = r.people, onAuthorClick = onActorClick,
            )
        }
        // 🔁 リポスト。
        if (g.reposters.isNotEmpty()) {
            ReactorRow(
                leading = { Icon(Icons.Outlined.Repeat, null, tint = DeckColors.Boost, modifier = Modifier.size(15.dp)) },
                label = "${g.reposters.size}", people = g.reposters, onAuthorClick = onActorClick,
            )
        }
        // ⚡ Zap（合計 sats）。
        if (g.zappers.isNotEmpty()) {
            ReactorRow(
                leading = { Icon(Icons.Outlined.Bolt, null, tint = DeckColors.Zap, modifier = Modifier.size(15.dp)) },
                label = "${g.zapSats} sats", people = g.zappers, onAuthorClick = onActorClick,
            )
        }
    }
}

/** [M10] 通知1行（通知一覧 / ホームタイムラインのインライン通知で共用）。 */
@Composable
fun NoticeRow(n: NotificationUi, selected: Boolean = false, onClick: () -> Unit, onActorClick: () -> Unit) {
    // [#222] キーボード選択ハイライト（NoteItem と同じ: 背景 Surface2 + 左 3dp アクセントバー）。
    val selFill = DeckColors.Surface2
    val selBar = DeckColors.Accent
    Column(
        Modifier.fillMaxWidth()
            .drawBehind {
                if (selected) {
                    drawRect(color = selFill)
                    drawRect(color = selBar, size = androidx.compose.ui.geometry.Size(3.dp.toPx(), size.height))
                }
            }
            .clickable(onClick = onClick).padding(DeckSpace.Md),
    ) {
      // [#254] 通知の対象（＝自分の投稿）は タイムラインの返信と同じ 1行プレビューで先頭に出す。
      // 「◁ 対象の投稿内容」→「(アイコン) 誰が何をしたか」の順に読める。
      // [#254] 対象（自分の投稿）の見せ方は種別で強弱を分ける（全行同サイズだと文字量が多すぎる）:
      //  - リプライ/メンション … ◁ + アイコン + 内容 の1行（名前は落として文字量を減らす）
      //  - リアクション/リポスト/Zap … さらに小さく（◁なし・12dpアバター・Micro）。
      //    「何に対してか」を追えれば十分で、主役は左の絵文字/アイコンと相手。
      // [#254] 対象（自分の投稿）の1行は**全種別で同じ体裁**（16dpアバター + Label）。
      // 種別による差は ◁ アイコンの有無だけ（リプライ/メンションは返信の文脈なので付ける）。
      n.targetSnippet?.takeIf { it.isNotBlank() }?.let { snippet ->
          ReplyContextLine(
              name = null,
              content = snippet,
              avatarSeed = n.targetAuthor?.pubkey,
              avatarUrl = n.targetAuthor?.pictureUrl,
              showIcon = n.kind == NotificationKind.REPLY || n.kind == NotificationKind.MENTION,
              modifier = Modifier.padding(bottom = DeckSpace.Sm),
          )
      }
      Row(verticalAlignment = Alignment.Top) {
        // 左の種別指標: リアクションは絵文字そのもの／返信・メンション・リポストはアイコン
        // （リポストはテーマに馴染むグリーン）。
        LeftIndicator(n)
        Spacer(Modifier.width(DeckSpace.Sm))
        // [#59] リアクションは「絵文字が主役／リアクターは控えめ」にするため、アバターを名前の
        // 文字高さ相当(16dp)まで縮める。返信/メンション/リポスト/Zap は従来どおり 34dp。
        val avatarSize = if (n.kind == NotificationKind.REACTION) 16.dp else 34.dp
        // アバターを少し下げて名前の文字位置に揃える。
        Avatar(n.actor.name, n.actor.pictureUrl, Modifier.padding(top = DeckSpace.Xs).clickable(onClick = onActorClick), size = avatarSize)
        Spacer(Modifier.width(DeckSpace.Sm))
        Column(Modifier.weight(1f)) {
            // 「○○がリアクション/リポスト」の文言は出さない（左アイコンで種別が分かる）。
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
            // [#254] 対象（自分の投稿）は上の1行プレビューが担うので、ここは「相手の言葉」だけ。
            //  - 返信/メンション … 相手の本文
            //  - Zap             … 金額（対象は上に出ている）
            //  - リアクション/リポスト … 本文なし（左の絵文字/アイコンで種別が分かる）
            val body = when (n.kind) {
                NotificationKind.REPLY, NotificationKind.MENTION -> n.text
                NotificationKind.ZAP -> "⚡ ${n.zapSats ?: 0} sats"
                else -> null
            }
            if (!body.isNullOrBlank()) {
                // [施策4] 名前行(ヘッダ群)↔本文は Sm で段差（NoteItem と統一）。
                Spacer(Modifier.size(DeckSpace.Sm))
                // ノートと同じくリッチテキスト化（nostr: 参照を ↗… に短縮・URL/タグをリンク化）。
                Text(
                    noteAnnotated(body), color = DeckColors.Text2, fontSize = DeckType.Caption,
                    maxLines = 3, overflow = TextOverflow.Ellipsis,
                )
            }
        }
      }
    }
}

/**
 * 左の種別指標。リアクションは「実際の絵文字」（♡置き換え＝何のリアクションか一目で分かる）。
 * NIP-30 カスタム絵文字は画像、通常絵文字は文字。返信/メンション/リポストはアイコン（リポストは緑）。
 * サイズは本文の文字高さ（名前 13.5sp）に合わせて控えめに。
 */
@Composable
private fun LeftIndicator(n: NotificationUi) {
    val glyph = 15.dp  // 返信/メンション/リポストのアイコンは文字高さに合わせる
    // [#59] リアクションの絵文字は主役として約1.5倍に拡大（カスタム絵文字画像は 23dp）。
    val reactionGlyph = 23.dp
    val top = Modifier.padding(top = DeckSpace.Xs)  // アバターと同じだけ下げて名前の文字位置に揃える
    when {
        // NIP-30 カスタム絵文字: 固定サイズの画像。
        n.kind == NotificationKind.REACTION && n.reactionImageUrl != null ->
            // [#277] iOS/Desktop でも GIF/アニメ WebP を動かすため共通コンポーネントへ。
            AnimatedEmoji(n.reactionImageUrl, contentDescription = n.reaction, modifier = top.size(reactionGlyph))
        // 通常の unicode 絵文字: 高さを固定すると descender が切れるので Text を自然サイズで描く。
        n.kind == NotificationKind.REACTION ->
            Text(n.reaction ?: "❤️", fontSize = DeckType.EmojiLg, maxLines = 1, modifier = top)
        // 返信/メンション/リポストはアイコン。
        else ->
            Icon(kindIcon(n.kind), null, tint = kindTint(n.kind), modifier = top.size(glyph))
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
