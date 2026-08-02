package app.nostrdeck.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import app.nostrdeck.model.CustomThemePrefs
import app.nostrdeck.model.ThemeEntry
import app.nostrdeck.theme.DeckColors
import app.nostrdeck.theme.DeckDimens
import app.nostrdeck.theme.DeckRadius
import app.nostrdeck.theme.DeckSpace
import app.nostrdeck.theme.DeckType
import app.nostrdeck.theme.DeckWeight
import app.nostrdeck.theme.customPalette
import com.github.skydoves.colorpicker.compose.BrightnessSlider
import com.github.skydoves.colorpicker.compose.HsvColorPicker
import com.github.skydoves.colorpicker.compose.rememberColorPickerController
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nostr_deck_client.composeapp.generated.resources.Res
import nostr_deck_client.composeapp.generated.resources.common_apply
import nostr_deck_client.composeapp.generated.resources.img_reset_defaults
import nostr_deck_client.composeapp.generated.resources.theme_applied_fmt
import nostr_deck_client.composeapp.generated.resources.theme_close
import nostr_deck_client.composeapp.generated.resources.theme_code_copy
import nostr_deck_client.composeapp.generated.resources.theme_code_import
import nostr_deck_client.composeapp.generated.resources.theme_code_invalid
import nostr_deck_client.composeapp.generated.resources.theme_code_label
import nostr_deck_client.composeapp.generated.resources.theme_code_paste
import nostr_deck_client.composeapp.generated.resources.theme_color_accent
import nostr_deck_client.composeapp.generated.resources.theme_color_bg
import nostr_deck_client.composeapp.generated.resources.theme_color_text
import nostr_deck_client.composeapp.generated.resources.theme_contrast_warn
import nostr_deck_client.composeapp.generated.resources.theme_contrast_warn_accent
import nostr_deck_client.composeapp.generated.resources.theme_custom
import nostr_deck_client.composeapp.generated.resources.theme_custom_desc
import nostr_deck_client.composeapp.generated.resources.theme_in_use
import nostr_deck_client.composeapp.generated.resources.theme_list_capped
import nostr_deck_client.composeapp.generated.resources.theme_loading
import nostr_deck_client.composeapp.generated.resources.theme_picker_toggle
import nostr_deck_client.composeapp.generated.resources.theme_presets
import nostr_deck_client.composeapp.generated.resources.theme_preview_label
import nostr_deck_client.composeapp.generated.resources.theme_preview_sample_action
import nostr_deck_client.composeapp.generated.resources.theme_preview_sample_body
import nostr_deck_client.composeapp.generated.resources.theme_preview_sample_name
import nostr_deck_client.composeapp.generated.resources.theme_previewing
import nostr_deck_client.composeapp.generated.resources.theme_publish
import nostr_deck_client.composeapp.generated.resources.theme_publish_failed
import nostr_deck_client.composeapp.generated.resources.theme_publish_name_hint
import nostr_deck_client.composeapp.generated.resources.theme_publish_note
import nostr_deck_client.composeapp.generated.resources.theme_publish_open
import nostr_deck_client.composeapp.generated.resources.theme_publish_moved
import nostr_deck_client.composeapp.generated.resources.theme_publish_ok
import nostr_deck_client.composeapp.generated.resources.theme_scope_all
import nostr_deck_client.composeapp.generated.resources.theme_scope_following
import nostr_deck_client.composeapp.generated.resources.theme_scope_mine
import nostr_deck_client.composeapp.generated.resources.theme_delete
import nostr_deck_client.composeapp.generated.resources.theme_delete_title
import nostr_deck_client.composeapp.generated.resources.theme_delete_text
import nostr_deck_client.composeapp.generated.resources.note_delete_confirm
import nostr_deck_client.composeapp.generated.resources.note_delete_sent
import nostr_deck_client.composeapp.generated.resources.note_delete_failed
import nostr_deck_client.composeapp.generated.resources.theme_search_hint
import nostr_deck_client.composeapp.generated.resources.theme_search_no_match
import nostr_deck_client.composeapp.generated.resources.theme_share_section
import nostr_deck_client.composeapp.generated.resources.theme_sort_label
import nostr_deck_client.composeapp.generated.resources.theme_sort_name
import nostr_deck_client.composeapp.generated.resources.theme_sort_newest
import nostr_deck_client.composeapp.generated.resources.theme_store_desc
import nostr_deck_client.composeapp.generated.resources.theme_store_empty
import nostr_deck_client.composeapp.generated.resources.theme_tab_customize
import nostr_deck_client.composeapp.generated.resources.theme_tab_store
import nostr_deck_client.composeapp.generated.resources.theme_title
import nostr_deck_client.composeapp.generated.resources.theme_undo
import org.jetbrains.compose.resources.stringResource
import org.jetbrains.compose.resources.getString

/** [#268] テーマシートの内部ページ。設定画面のどちらの導線から開いたかで初期値を変える。 */
internal enum class ThemePage { CUSTOMIZE, STORE }

/**
 * [#268] テーマ設定モーダル（カスタマイズ/ストア統合）。
 *
 * 旧 ThemeCustomizeSheet / ThemeStoreSheet の「タップで即適用」をやめ、**プレビュー方式**にする:
 * プリセット/ストア行/色編集/共有コードの選択はシート内の下書き（draft）とプレビューカードにのみ
 * 反映し、「適用」を押して初めてアプリ全体へ反映する。タブでカスタマイズ⇄ストアを行き来できる。
 */
@Composable
internal fun ThemeSheet(
    repo: app.nostrdeck.data.EventRepository,
    current: CustomThemePrefs,
    initialPage: ThemePage,
    onApply: (CustomThemePrefs, String) -> Unit,
    undoName: String,
    canUndo: Boolean,
    onUndo: () -> Unit,
    onDismiss: () -> Unit,
) {
    var page by remember { mutableStateOf(initialPage) }
    // 下書き（プレビュー対象）。適用/Undo で全体の色が変わったら追従させる。
    var draft by remember { mutableStateOf(current) }
    var draftName by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(current) { draft = current }
    val setDraft: (CustomThemePrefs, String?) -> Unit = { p, name -> draft = p; draftName = name }
    // [#162] onClick（非 Composable）から使う文言はコンポジション中に解決しておく。
    val customLabel = stringResource(Res.string.theme_custom)

    // [#284] ボトムシートをやめ Dialog ベースの全画面モーダルへ（シートのドラッグと中身の
    // スクロールが競合して UI が不安定になるため）。タブ/プレビューはヘッダー固定、
    // 各ページだけがスクロールする。
    AppModalSheet(
        title = stringResource(Res.string.theme_title),
        onDismiss = onDismiss,
        headerExtra = {
            Row(horizontalArrangement = Arrangement.spacedBy(DeckSpace.Sm)) {
                ChoiceChip(stringResource(Res.string.theme_tab_customize), selected = page == ThemePage.CUSTOMIZE) {
                    page = ThemePage.CUSTOMIZE
                }
                ChoiceChip(stringResource(Res.string.theme_tab_store), selected = page == ThemePage.STORE) {
                    page = ThemePage.STORE
                }
            }
            Spacer(Modifier.size(DeckSpace.Md))

            // プレビュー（常に見える位置に固定。ページを切り替えても選択中の下書きを映し続ける）。
            Text(stringResource(Res.string.theme_preview_label), color = DeckColors.Text3, fontSize = DeckType.Label)
            Spacer(Modifier.size(DeckSpace.Xs))
            ThemePreviewCard(draft)
            Spacer(Modifier.size(DeckSpace.Md))
        },
    ) {
        Box(Modifier.weight(1f, fill = false)) {
            when (page) {
                ThemePage.CUSTOMIZE -> ThemeCustomizePage(repo, draft, setDraft)
                ThemePage.STORE -> ThemeStorePage(repo, current, draft, setDraft)
            }
        }

        Spacer(Modifier.size(DeckSpace.Sm))
        if (canUndo) {
            ThemeUndoBar(undoName, onUndo)
            Spacer(Modifier.size(DeckSpace.Sm))
        }
        DeckButton(
            stringResource(Res.string.common_apply),
            enabled = draft != current,
            modifier = Modifier.fillMaxWidth(),
            onClick = { onApply(draft, draftName ?: customLabel) },
        )
        Spacer(Modifier.size(DeckSpace.Md))
    }
}

/**
 * 下書き3色のライブプレビュー。実際の導出パレット（customPalette）で投稿カードのモックを描き、
 * 面（surface）・補助文字（text2/3）・アクセントまで適用後の見た目を伝える。
 */
@Composable
private fun ThemePreviewCard(prefs: CustomThemePrefs) {
    val p = customPalette(prefs)
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(DeckRadius.Md))
            .background(p.bg)
            .border(1.dp, p.border, RoundedCornerShape(DeckRadius.Md))
            .padding(DeckSpace.Sm),
    ) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(DeckRadius.Sm))
                .background(p.surface).padding(DeckSpace.Sm),
        ) {
            Box(Modifier.size(28.dp).clip(CircleShape).background(p.surface3))
            Spacer(Modifier.size(DeckSpace.Sm))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(Res.string.theme_preview_sample_name),
                        color = p.text, fontSize = DeckType.Sub, fontWeight = DeckWeight.Name,
                    )
                    Spacer(Modifier.size(DeckSpace.Xs))
                    Text("· 1m", color = p.text3, fontSize = DeckType.Label)
                }
                Spacer(Modifier.size(DeckSpace.Xs))
                Text(
                    stringResource(Res.string.theme_preview_sample_body),
                    color = p.text2, fontSize = DeckType.Label, maxLines = 2,
                )
                Spacer(Modifier.size(DeckSpace.Sm))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.clip(RoundedCornerShape(DeckRadius.Full)).background(p.accent)
                            .padding(horizontal = DeckSpace.Md, vertical = DeckSpace.Xs),
                    ) {
                        Text(
                            stringResource(Res.string.theme_preview_sample_action),
                            color = p.bg, fontSize = DeckType.Label,
                        )
                    }
                    Spacer(Modifier.size(DeckSpace.Sm))
                    Box(
                        Modifier.size(width = 40.dp, height = 6.dp)
                            .clip(RoundedCornerShape(3.dp)).background(p.accentWeak),
                    )
                }
            }
        }
    }
}

/** カスタマイズページ: プリセットと3色の編集（hex + カラーピッカー）。すべて下書きにのみ反映。 */
@Composable
private fun ThemeCustomizePage(
    repo: app.nostrdeck.data.EventRepository,
    draft: CustomThemePrefs,
    onDraft: (CustomThemePrefs, String?) -> Unit,
) {
    val Prefs = CustomThemePrefs
    // 展開中のピッカー（0=背景 1=文字 2=アクセント）。同時に1つだけ開く。
    var pickerFor by remember { mutableStateOf<Int?>(null) }
    // [#286] 公開はここから1タップで（旧: ストアタブの折りたたみに埋もれていて気付けなかった）。
    val scope = rememberCoroutineScope()
    val toast = rememberToaster()
    var showPublish by remember { mutableStateOf(false) }
    var publishName by remember { mutableStateOf("") }
    val publishOkMsg = stringResource(Res.string.theme_publish_ok)
    val publishFailMsg = stringResource(Res.string.theme_publish_failed)

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Text(stringResource(Res.string.theme_custom_desc), color = DeckColors.Text3, fontSize = DeckType.Label)
        Spacer(Modifier.size(DeckSpace.Md))

        Text(stringResource(Res.string.theme_presets), color = DeckColors.Text2, fontSize = DeckType.Label)
        Spacer(Modifier.size(DeckSpace.Xs))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(DeckSpace.Sm)) {
            items(Prefs.PRESETS.size) { i ->
                val (name, p, _) = Prefs.PRESETS[i]
                val selected = p == draft
                Column(
                    Modifier.clip(RoundedCornerShape(DeckRadius.Md))
                        .background(if (selected) DeckColors.AccentWeak else DeckColors.Surface2)
                        .clickable { onDraft(p, name) }
                        .padding(DeckSpace.Sm),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    ThemeMiniCard(p)
                    Spacer(Modifier.size(DeckSpace.Xs))
                    Text(name, color = DeckColors.Text2, fontSize = DeckType.Micro)
                }
            }
        }
        Spacer(Modifier.size(DeckSpace.Lg))

        ColorEditRow(
            label = stringResource(Res.string.theme_color_bg), value = draft.bg,
            expanded = pickerFor == 0, onToggle = { pickerFor = if (pickerFor == 0) null else 0 },
            onChange = { onDraft(draft.copy(bg = it), null) },
        )
        ColorEditRow(
            label = stringResource(Res.string.theme_color_text), value = draft.text,
            expanded = pickerFor == 1, onToggle = { pickerFor = if (pickerFor == 1) null else 1 },
            onChange = { onDraft(draft.copy(text = it), null) },
        )
        ColorEditRow(
            label = stringResource(Res.string.theme_color_accent), value = draft.accent,
            expanded = pickerFor == 2, onToggle = { pickerFor = if (pickerFor == 2) null else 2 },
            onChange = { onDraft(draft.copy(accent = it), null) },
        )

        // コントラスト警告（警告のみで適用はブロックしない）。本文 4.5:1 / アクセント 3:1 が目安。
        val textRatio = Prefs.contrastRatio(draft.bg, draft.text)
        if (textRatio < 4.5) {
            Text(
                stringResource(Res.string.theme_contrast_warn, ((textRatio * 10).toInt() / 10.0).toString()),
                color = DeckColors.Warn, fontSize = DeckType.Label,
            )
            Spacer(Modifier.size(DeckSpace.Sm))
        }
        val accentRatio = Prefs.contrastRatio(draft.bg, draft.accent)
        if (accentRatio < 3.0) {
            Text(
                stringResource(Res.string.theme_contrast_warn_accent, ((accentRatio * 10).toInt() / 10.0).toString()),
                color = DeckColors.Warn, fontSize = DeckType.Label,
            )
            Spacer(Modifier.size(DeckSpace.Sm))
        }

        DeckGhostButton(stringResource(Res.string.img_reset_defaults), onClick = {
            onDraft(CustomThemePrefs.DEFAULT, null)
        })

        // [#286] この配色をそのままテーマストアへ公開する導線。
        Spacer(Modifier.size(DeckSpace.Lg))
        HorizontalDivider(color = DeckColors.Border)
        Spacer(Modifier.size(DeckSpace.Md))
        Text(stringResource(Res.string.theme_publish_note), color = DeckColors.Text3, fontSize = DeckType.Label)
        Spacer(Modifier.size(DeckSpace.Sm))
        DeckButton(
            stringResource(Res.string.theme_publish_open),
            onClick = { showPublish = true },
        )
        Spacer(Modifier.size(DeckSpace.Xl))
    }

    // 名前だけ聞いて公開する（配色は編集中の下書きをそのまま使う）。
    if (showPublish) {
        DeckInputDialog(
            title = stringResource(Res.string.theme_publish_open),
            placeholder = stringResource(Res.string.theme_publish_name_hint),
            value = publishName,
            onValueChange = { publishName = it },
            confirmLabel = stringResource(Res.string.theme_publish),
            confirmEnabled = publishName.isNotBlank(),
            onConfirm = {
                val name = publishName.trim()
                showPublish = false
                scope.launch {
                    val ok = repo.publishTheme(
                        ThemeEntry(name = name, colors = draft, minAppVersion = appVersionName),
                    )
                    toast(if (ok) publishOkMsg else publishFailMsg)
                    if (ok) publishName = ""
                }
            },
            onDismiss = { showPublish = false },
        )
    }
}

/**
 * 1色分の編集行: 見本スウォッチ + hex 入力 + ピッカー開閉。展開すると HSV ピッカーと明度スライダー。
 * hex は完全な値になった時だけ下書きへ反映する（入力途中で戻さない）。
 */
@Composable
private fun ColorEditRow(
    label: String,
    value: Int,
    expanded: Boolean,
    onToggle: () -> Unit,
    onChange: (Int) -> Unit,
) {
    val Prefs = CustomThemePrefs
    // 外部（プリセット/ピッカー）で値が変わったら hex 表示を作り直す。入力途中は保持される。
    var hex by remember(value) { mutableStateOf(Prefs.toHex(value)) }

    Text(label, color = DeckColors.Text2, fontSize = DeckType.Label)
    Spacer(Modifier.size(DeckSpace.Xs))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(28.dp).clip(RoundedCornerShape(DeckRadius.Sm))
                .background(Color(value))
                .border(1.dp, DeckColors.Border, RoundedCornerShape(DeckRadius.Sm))
                .clickable(onClick = onToggle),
        )
        Spacer(Modifier.size(DeckSpace.Sm))
        DeckTextField(
            value = hex,
            onValueChange = {
                hex = it.take(7)
                Prefs.parseHex(hex)?.let { v -> if (v != value) onChange(v) }
            },
            modifier = Modifier.weight(1f),
            placeholder = "#RRGGBB",
        )
        Spacer(Modifier.size(DeckSpace.Sm))
        IconButton(onClick = onToggle) {
            Icon(
                Icons.Outlined.Palette, contentDescription = stringResource(Res.string.theme_picker_toggle),
                tint = if (expanded) DeckColors.Text else DeckColors.Text3,
                modifier = Modifier.size(DeckDimens.IconMd),
            )
        }
    }
    if (expanded) {
        val controller = rememberColorPickerController()
        // 外部で値が変わったらピッカーの選択位置を追従（fromUser=false なので onChange へ再帰しない）。
        LaunchedEffect(value) {
            if (controller.selectedColor.value.toArgb() != value) {
                controller.selectByColor(Color(value), fromUser = false)
            }
        }
        Spacer(Modifier.size(DeckSpace.Sm))
        // 幅いっぱいにするとホイール外の余白までタッチを奪いシートがスクロールできなくなるため、
        // ピッカーは固定幅で中央に置き、左右をスクロール可能な余白として残す。
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            HsvColorPicker(
                modifier = Modifier.size(220.dp),
                controller = controller,
                initialColor = Color(value),
                onColorChanged = { envelope ->
                    if (envelope.fromUser) onChange(envelope.color.copy(alpha = 1f).toArgb())
                },
            )
            Spacer(Modifier.size(DeckSpace.Sm))
            BrightnessSlider(
                modifier = Modifier.width(220.dp).height(24.dp)
                    .clip(RoundedCornerShape(DeckRadius.Full)),
                controller = controller,
                initialColor = Color(value),
            )
        }
    }
    Spacer(Modifier.size(DeckSpace.Sm))
}

/** [#264] ストアの絞り込み範囲。 */
private enum class StoreScope { ALL, FOLLOWING, MINE }

/** [#264] ストアの並び替え。 */
private enum class StoreSort { NEWEST, NAME }

/** themeEntriesFlow / requestThemes と揃えた表示上限（超過分は取得していない旨を出す）。 */
private const val THEME_LIST_CAP = 200

@Composable
private fun storeScopeLabel(s: StoreScope): String = when (s) {
    StoreScope.ALL -> stringResource(Res.string.theme_scope_all)
    StoreScope.FOLLOWING -> stringResource(Res.string.theme_scope_following)
    StoreScope.MINE -> stringResource(Res.string.theme_scope_mine)
}

@Composable
private fun storeSortLabel(s: StoreSort): String = when (s) {
    StoreSort.NEWEST -> stringResource(Res.string.theme_sort_newest)
    StoreSort.NAME -> stringResource(Res.string.theme_sort_name)
}

/**
 * ストアページ: 配布テーマ（NIP-78 kind:30078 + t=nostrism-theme）の検索・一覧。
 * 行タップは**下書きへの取り込み（プレビュー）**で、適用はシート下部の「適用」ボタンが行う。
 * 共有コード・公開は使用頻度が低いので折りたたみに収める。
 */
@Composable
private fun ThemeStorePage(
    repo: app.nostrdeck.data.EventRepository,
    current: CustomThemePrefs,
    draft: CustomThemePrefs,
    onSelect: (CustomThemePrefs, String?) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val toast = rememberToaster()
    val entries by remember(repo) { repo.themeEntriesFlow() }.collectAsState(emptyList())
    val follows by repo.followsFlow().collectAsState()
    val me by repo.loggedInPubkey().collectAsState(null)
    val clipboard = rememberClipboardCopy()
    val paste = rememberClipboardPaste()
    val names = LocalProfileNames.current

    var query by remember { mutableStateOf("") }
    var storeScope by remember { mutableStateOf(StoreScope.ALL) }
    var sort by remember { mutableStateOf(StoreSort.NEWEST) }
    var shareOpen by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") }
    var publishName by remember { mutableStateOf("") }
    // [#319] 削除リクエストの確認対象。取り消せない発行なので必ず挟む。
    var deleteTarget by remember { mutableStateOf<ThemeEntry?>(null) }
    val invalidCodeMsg = stringResource(Res.string.theme_code_invalid)

    LaunchedEffect(Unit) { repo.requestThemes() }
    // リレー取得は完了通知が無いので、開いてからしばらくは「取得中」を出し空表示と区別する。
    var loadingWindow by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) { delay(5_000); loadingWindow = false }
    // 作者名で検索・表示するためプロフィールを取っておく（表示名は LocalProfileNames に載る）。
    LaunchedEffect(entries) { entries.mapNotNull { it.author }.distinct().forEach { repo.loadProfile(it) } }

    val shown = remember(entries, query, storeScope, sort, follows, me, names) {
        val q = query.trim().lowercase()
        entries.asSequence()
            .filter { e ->
                when (storeScope) {
                    StoreScope.ALL -> true
                    StoreScope.FOLLOWING -> e.author != null && e.author in follows
                    StoreScope.MINE -> e.author != null && e.author == me
                }
            }
            .filter { e ->
                if (q.isEmpty()) true
                else e.name.lowercase().contains(q) ||
                    (e.author?.let { names[it] }?.lowercase()?.contains(q) == true)
            }
            .let { seq -> if (sort == StoreSort.NAME) seq.sortedBy { it.name.lowercase() } else seq }
            .toList()
    }

    // [#319] テーマの削除リクエスト。**消える保証はない**ことを本文で明示する。
    deleteTarget?.let { target ->
        DeckConfirmDialog(
            title = stringResource(Res.string.theme_delete_title),
            text = stringResource(Res.string.theme_delete_text),
            confirmLabel = stringResource(Res.string.note_delete_confirm), destructive = true,
            onConfirm = {
                deleteTarget = null
                scope.launch {
                    val ok = repo.requestDeleteTheme(target)
                    toast(getString(if (ok) Res.string.note_delete_sent else Res.string.note_delete_failed))
                }
            },
            onDismiss = { deleteTarget = null },
        )
    }

    Column(Modifier.fillMaxSize()) {
        Text(stringResource(Res.string.theme_store_desc), color = DeckColors.Text3, fontSize = DeckType.Label)
        Spacer(Modifier.size(DeckSpace.Sm))
        DeckTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = stringResource(Res.string.theme_search_hint),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        )
        Spacer(Modifier.size(DeckSpace.Sm))
        Row(verticalAlignment = Alignment.CenterVertically) {
            StoreScope.entries.forEach { sc ->
                ChoiceChip(storeScopeLabel(sc), selected = storeScope == sc) { storeScope = sc }
                Spacer(Modifier.size(DeckSpace.Xs))
            }
            Spacer(Modifier.weight(1f))
            StoreSort.entries.forEach { so ->
                ChoiceChip(storeSortLabel(so), selected = sort == so) { sort = so }
                Spacer(Modifier.size(DeckSpace.Xs))
            }
            Text(
                if (shown.size == entries.size) "${entries.size}" else "${shown.size}/${entries.size}",
                color = DeckColors.Text3, fontSize = DeckType.Micro,
            )
        }
        if (entries.size >= THEME_LIST_CAP) {
            Spacer(Modifier.size(DeckSpace.Xs))
            Text(
                stringResource(Res.string.theme_list_capped, THEME_LIST_CAP.toString()),
                color = DeckColors.Text3, fontSize = DeckType.Micro,
            )
        }
        Spacer(Modifier.size(DeckSpace.Sm))

        // [#268] 一覧は LazyColumn（最大200件を全コンポーズしない）。
        LazyColumn(
            Modifier.fillMaxWidth().weight(1f),
            verticalArrangement = Arrangement.spacedBy(DeckSpace.Sm),
        ) {
            if (entries.isEmpty()) {
                item {
                    if (loadingWindow) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(DeckDimens.IconMd),
                                color = DeckColors.Text3, strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.size(DeckSpace.Sm))
                            Text(stringResource(Res.string.theme_loading), color = DeckColors.Text3, fontSize = DeckType.Sub)
                        }
                    } else {
                        Text(stringResource(Res.string.theme_store_empty), color = DeckColors.Text3, fontSize = DeckType.Sub)
                    }
                }
            } else if (shown.isEmpty()) {
                item {
                    Text(stringResource(Res.string.theme_search_no_match), color = DeckColors.Text3, fontSize = DeckType.Sub)
                }
            } else {
                items(shown.size) { i ->
                    val e = shown[i]
                    ThemeStoreRow(
                        entry = e,
                        applied = e.colors == current,
                        selected = e.colors == draft,
                        authorName = e.author?.let { names[it] },
                        onSelect = { onSelect(e.colors, e.name) },
                        onDelete = if (me != null && e.author == me) ({ deleteTarget = e }) else null,
                    )
                }
            }
        }

        HorizontalDivider(color = DeckColors.Border)
        // ---- 共有コード・公開（使用頻度が低いので折りたたみ。既定は閉） ----
        Row(
            Modifier.fillMaxWidth().clickable { shareOpen = !shareOpen }.padding(vertical = DeckSpace.Sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(Res.string.theme_share_section),
                color = DeckColors.Text2, fontSize = DeckType.Sub, modifier = Modifier.weight(1f),
            )
            Icon(
                if (shareOpen) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                contentDescription = null, tint = DeckColors.Text3, modifier = Modifier.size(DeckDimens.IconMd),
            )
        }
        if (shareOpen) {
            // 共有コード: 取り込みは下書きへ（プレビュー）、コピーは下書きの配色を書き出す。
            Row(verticalAlignment = Alignment.CenterVertically) {
                DeckTextField(
                    value = code,
                    onValueChange = { code = it },
                    modifier = Modifier.weight(1f),
                    placeholder = stringResource(Res.string.theme_code_label),
                )
                Spacer(Modifier.size(DeckSpace.Sm))
                DeckButton(
                    stringResource(Res.string.theme_code_import),
                    enabled = code.isNotBlank(),
                    onClick = {
                        val e = ThemeEntry.decodeCode(code)
                        if (e == null) toast(invalidCodeMsg) else { onSelect(e.colors, e.name); code = "" }
                    },
                )
            }
            Spacer(Modifier.size(DeckSpace.Xs))
            Row(horizontalArrangement = Arrangement.spacedBy(DeckSpace.Sm)) {
                DeckGhostButton(stringResource(Res.string.theme_code_paste), onClick = { paste()?.let { code = it.trim() } })
                DeckGhostButton(stringResource(Res.string.theme_code_copy), onClick = {
                    clipboard(
                        ThemeEntry.encodeCode(
                            ThemeEntry(
                                name = publishName.ifBlank { "MyTheme" },
                                colors = draft,
                                minAppVersion = appVersionName,
                            ),
                        ),
                    )
                })
            }
            Spacer(Modifier.size(DeckSpace.Sm))
            // [#286] 公開は「カスタマイズ」タブのボタンへ移した（ここに埋もれて気付けなかったため）。
            Text(stringResource(Res.string.theme_publish_moved), color = DeckColors.Text3, fontSize = DeckType.Label)
            Spacer(Modifier.size(DeckSpace.Sm))
        }
    }
}

/**
 * [#264] ストア一覧の1行。ミニカードで実際の見た目（背景＋文字＋アクセント）を示す。
 * [#268] タップは下書きへの取り込み（プレビュー）。適用中/プレビュー中を右端に表示する。
 */
@Composable
private fun ThemeStoreRow(
    entry: ThemeEntry,
    applied: Boolean,
    selected: Boolean,
    authorName: String?,
    onSelect: () -> Unit,
    // [#319] 自分が公開したテーマだけ削除をリクエストできる。null なら出さない。
    onDelete: (() -> Unit)? = null,
) {
    // アプリ版がテーマの要求版より古いか（警告バッジ用。適用は許す）。
    val tooNew = ThemeEntry.isOlderThan(appVersionName, entry.minAppVersion)

    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(DeckRadius.Md))
            .background(if (selected) DeckColors.AccentWeak else DeckColors.Surface2)
            .clickable(onClick = onSelect)
            .padding(DeckSpace.Sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ThemeMiniCard(entry.colors)
        Spacer(Modifier.size(DeckSpace.Sm))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(entry.name, color = DeckColors.Text, fontSize = DeckType.Sub, maxLines = 1)
                if (tooNew) {
                    Spacer(Modifier.size(DeckSpace.Xs))
                    Text(
                        "⚠ v${entry.minAppVersion}+",
                        color = DeckColors.Warn, fontSize = DeckType.Micro, maxLines = 1,
                    )
                }
            }
            val who = authorName?.takeIf { it.isNotBlank() }
                ?: entry.author?.take(8)?.let { "$it…" } ?: ""
            if (who.isNotBlank()) {
                Text(who, color = DeckColors.Text3, fontSize = DeckType.Micro, maxLines = 1)
            }
        }
        if (applied) {
            Text(stringResource(Res.string.theme_in_use), color = DeckColors.Text2, fontSize = DeckType.Micro)
        } else if (selected) {
            Text(stringResource(Res.string.theme_previewing), color = DeckColors.Text2, fontSize = DeckType.Micro)
        }
        // [#319] 自分のテーマは削除をリクエストできる。行タップ(プレビュー)と紛れないよう
        // 独立したタッチ領域にする。
        if (onDelete != null) {
            Box(
                Modifier.size(DeckDimens.TouchTargetSm).clip(CircleShape).clickable(onClick = onDelete),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Outlined.DeleteOutline, stringResource(Res.string.theme_delete),
                    tint = DeckColors.Text3, modifier = Modifier.size(DeckDimens.IconMd),
                )
            }
        }
    }
}

/** [#267] 3色の見本（背景の上に文字サンプルとアクセントのピル）。行の左に置く。 */
@Composable
internal fun ThemeMiniCard(prefs: CustomThemePrefs) {
    Box(
        Modifier.size(width = 56.dp, height = 40.dp)
            .clip(RoundedCornerShape(DeckRadius.Sm))
            .background(Color(prefs.bg)),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Aa", color = Color(prefs.text), fontSize = DeckType.Label)
            Spacer(Modifier.size(DeckSpace.Xs))
            Box(
                Modifier.size(width = 14.dp, height = 5.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(Color(prefs.accent)),
            )
        }
    }
}

/** [#264] 適用直後の「元に戻す」バー。シート内（開いている間）と設定画面（閉じた後）で使う。 */
@Composable
internal fun ThemeUndoBar(name: String, onUndo: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(DeckRadius.Md))
            .background(DeckColors.Surface3).padding(DeckSpace.Sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stringResource(Res.string.theme_applied_fmt, name),
            color = DeckColors.Text2, fontSize = DeckType.Label, modifier = Modifier.weight(1f),
        )
        DeckTextButton(stringResource(Res.string.theme_undo), onClick = onUndo)
    }
}
